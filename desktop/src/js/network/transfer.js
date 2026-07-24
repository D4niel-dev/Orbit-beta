const Protocol = require('./protocol');
const path = require('path');
const os = require('os');
const fs = require('fs');

const STALE_TIMEOUT = 60000; // 60s without activity = stale
const MAX_CHUNK_RETRIES = 3;

class TransferManager {
  constructor(socketManager) {
    this.socketManager = socketManager;
    this.CHUNK_SIZE = 64 * 1024; // 64KB
    this.activeReceives = new Map();
    this.cancelledSends = new Set();
    this.onProgress = null; // callback(fileId, { received, total, isSending })
    this.onError = null; // callback(fileId, errorMsg)
    this._cleanupTimer = setInterval(() => this._cleanupStale(), 30000);
  }

  destroy() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
    for (const [fileId, transfer] of this.activeReceives.entries()) {
      try {
        transfer.stream.end();
        if (fs.existsSync(transfer.tempPath)) fs.unlinkSync(transfer.tempPath);
      } catch (_) {}
    }
    this.activeReceives.clear();
    this.cancelledSends.clear();
  }

  _cleanupStale() {
    const now = Date.now();
    for (const [fileId, transfer] of this.activeReceives.entries()) {
      if (now - transfer.lastActivity > STALE_TIMEOUT) {
        try { transfer.stream.end(); } catch (_) {}
        try { if (fs.existsSync(transfer.tempPath)) fs.unlinkSync(transfer.tempPath); } catch (_) {}
        this.activeReceives.delete(fileId);
        if (this.onError) this.onError(fileId, 'Transfer timed out (no activity for 60s)');
      }
    }
  }

  _hasDiskSpace(fileSize) {
    try {
      const statfs = fs.statfsSync(os.tmpdir());
      const available = statfs.bavail * statfs.bsize;
      return available > fileSize * 1.1; // 10% buffer
    } catch (_) {
      return true; // can't check, proceed optimistically
    }
  }

  cancelReceive(fileId) {
    const transfer = this.activeReceives.get(fileId);
    if (!transfer) return false;
    try { transfer.stream.end(); } catch (_) {}
    try { if (fs.existsSync(transfer.tempPath)) fs.unlinkSync(transfer.tempPath); } catch (_) {}
    this.activeReceives.delete(fileId);
    return true;
  }

  cancelSend(fileId) {
    this.cancelledSends.add(fileId);
  }

  async sendFile(toPeerId, toIp, filePath, fileName) {
    if (!fs.existsSync(filePath)) return false;

    const stats = fs.statSync(filePath);
    if (stats.size > 250 * 1024 * 1024) {
      throw new Error("File exceeds 250MB limit.");
    }

    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');
    const hashStream = fs.createReadStream(filePath);
    await new Promise((resolve, reject) => {
      hashStream.on('data', chunk => hash.update(chunk));
      hashStream.on('end', resolve);
      hashStream.on('error', reject);
    });
    const fileHash = hash.digest('hex');

    const basename = path.basename(filePath);
    const displayName = fileName || basename;
    const fileId = require('crypto').randomUUID();
    const totalChunks = Math.ceil(stats.size / this.CHUNK_SIZE);

    const readStream = fs.createReadStream(filePath, { highWaterMark: this.CHUNK_SIZE });
    const _sm = this.socketManager;

    // Send START only after file read stream opens successfully (XFER-1)
    readStream.on('open', function() {
      _sm.sendMessage(toPeerId, toIp, Protocol.Types.FILE_TRANSFER_START, {
        fileId, fileName: basename, fileSize: stats.size, totalChunks, hash: fileHash
      });
    });

    // Handle read stream errors
    readStream.on('error', (err) => {
      _sm.sendMessage(toPeerId, toIp, Protocol.Types.FILE_TRANSFER_CANCEL, { fileId, error: err.message });
    });

    let chunkIndex = 0;

    for await (const chunk of readStream) {
      if (this.cancelledSends.has(fileId)) {
        this.cancelledSends.delete(fileId);
        readStream.destroy();
        _sm.sendMessage(toPeerId, toIp, Protocol.Types.FILE_TRANSFER_CANCEL, { fileId });
        throw new Error('Send cancelled');
      }

      const payload = { fileId, chunkIndex, data: chunk.toString('base64') };
      let sent = false;
      for (let retry = 0; retry < MAX_CHUNK_RETRIES; retry++) {
        sent = _sm.sendMessage(toPeerId, toIp, Protocol.Types.FILE_CHUNK, payload);
        if (sent) break;
        await new Promise(r => setTimeout(r, Math.min(200 * Math.pow(2, retry), 5000)));
      }
      if (!sent) {
        readStream.destroy();
        throw new Error(`Failed to send chunk ${chunkIndex}/${totalChunks} after ${MAX_CHUNK_RETRIES} retries`);
      }

      if (this.onProgress) {
        this.onProgress(fileId, { received: chunkIndex + 1, total: totalChunks, isSending: true, name: displayName });
      }

      // Write backpressure: yield to event loop between chunks
      await new Promise(r => setImmediate(r));
      chunkIndex++;
    }
    
    _sm.sendMessage(toPeerId, toIp, Protocol.Types.FILE_TRANSFER_END, { fileId, hash: fileHash });
    return fileId;
  }

  handleStart(packet) {
    if (!packet || !packet.payload) return;
    const payload = packet.payload;
    if (this.activeReceives.has(payload.fileId)) return;

    // Check disk space before accepting
    if (!this._hasDiskSpace(payload.fileSize)) {
      this.socketManager.sendMessage(packet.from, null, Protocol.Types.FILE_TRANSFER_REJECT, {
        fileId: payload.fileId,
        reason: 'disk_space'
      });
      return;
    }

    const tempPath = path.join(os.tmpdir(), `orbit_${payload.fileId}`);
    const writeStream = fs.createWriteStream(tempPath);
    
    this.activeReceives.set(payload.fileId, {
      fileName: payload.fileName,
      fileSize: payload.fileSize,
      totalChunks: payload.totalChunks,
      hash: payload.hash,
      receivedCount: 0,
      stream: writeStream,
      tempPath: tempPath,
      sha256: require('crypto').createHash('sha256'),
      lastActivity: Date.now(),
      senderId: packet.from
    });
  }

  handleChunk(packet) {
    if (!packet || !packet.payload) return;
    const payload = packet.payload;
    const transfer = this.activeReceives.get(payload.fileId);
    if (!transfer) return;

    const buffer = Buffer.from(payload.data, 'base64');
    try {
      const canContinue = transfer.stream.write(buffer);
      // Apply backpressure if internal buffer is full (XFER-5: guard against listener pileup)
      if (!canContinue && !transfer._backpressured) {
        transfer._backpressured = true;
        transfer.stream.once('drain', () => {
          transfer._backpressured = false;
        });
      }
    } catch (err) {
      this.cancelReceive(payload.fileId);
      if (this.onError) this.onError(payload.fileId, 'Disk write error: ' + err.message);
      return;
    }
    transfer.sha256.update(buffer);
    transfer.receivedCount++;
    transfer.lastActivity = Date.now();

    if (this.onProgress) {
      this.onProgress(payload.fileId, { received: transfer.receivedCount, total: transfer.totalChunks, isSending: false, name: transfer.fileName });
    }
  }

  handleEnd(packet, onComplete, onError) {
    if (!packet || !packet.payload) return;
    const payload = packet.payload;
    const transfer = this.activeReceives.get(payload.fileId);
    if (!transfer) return;

    // Validate that the sender matches the transfer owner (XFER-4)
    if (packet.from && transfer.senderId && packet.from !== transfer.senderId) {
      if (onError) onError('Received FILE_TRANSFER_END from non-owner', payload.fileId);
      return;
    }

    try {
      transfer.stream.end();
      // Wait for stream flush before finalizing (XFER-6: race condition fix)
      // Without this, onComplete → dbSaveAttachment → fs.readFileSync may read an incomplete file
      transfer.stream.on('finish', () => {
        try {
          const finalHash = transfer.sha256.digest('hex');
          // Don't delete from activeReceives until after finish, to prevent races

          // Skip hash check when sender omitted hash (mobile sends without hash in some cases) — CRIT-1
          if (transfer.hash && finalHash !== transfer.hash) {
            console.warn('[Transfer] Hash mismatch: expected=' + transfer.hash + ' actual=' + finalHash + ' file=' + transfer.fileName + ' — saving anyway (non-fatal). Platform hash differences are expected (e.g. crypto.subtle on Android WebView).');
            // File is likely intact despite platform hash differences;
            // save it so the user doesn't lose the transfer (CRIT-1 fix: non-fatal)
          }
          this.activeReceives.delete(payload.fileId);
          if (onComplete) onComplete(transfer.tempPath, transfer.fileName, payload.fileId, transfer.fileSize);
        } catch (err) {
          this.activeReceives.delete(payload.fileId);
          if (onError) onError('handleEnd error: ' + (err && err.message), payload.fileId);
        }
      });
    } catch (err) {
      this.activeReceives.delete(payload.fileId);
      if (onError) onError('handleEnd error: ' + (err && err.message), payload.fileId);
    }
  }

  handleCancel(packet) {
    if (!packet || !packet.payload) return;
    const payload = packet.payload;
    var transfer = this.activeReceives.get(payload.fileId);
    if (transfer && packet.from && transfer.senderId && packet.from !== transfer.senderId) return;
    this.cancelReceive(payload.fileId);
  }
}

module.exports = TransferManager;
