const Protocol = require('./protocol');
const path = require('path');
const os = require('os');
const fs = require('fs');

class TransferManager {
  constructor(socketManager) {
    this.socketManager = socketManager;
    this.CHUNK_SIZE = 64 * 1024; // 64KB
    this.activeReceives = new Map(); 
    this.onProgress = null; // callback(fileId, { received, total, isSending })
  }

  async sendFile(toPeerId, toIp, filePath) {
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

    const fileName = path.basename(filePath);
    const fileId = require('crypto').randomUUID();
    const totalChunks = Math.ceil(stats.size / this.CHUNK_SIZE);

    this.socketManager.sendMessage(toPeerId, toIp, Protocol.Types.FILE_TRANSFER_START, {
      fileId, fileName, fileSize: stats.size, totalChunks, hash: fileHash
    });

    const readStream = fs.createReadStream(filePath, { highWaterMark: this.CHUNK_SIZE });
    let chunkIndex = 0;
    
    for await (const chunk of readStream) {
      const payload = { fileId, chunkIndex, data: chunk.toString('base64') };
      this.socketManager.sendMessage(toPeerId, toIp, Protocol.Types.FILE_CHUNK, payload);
      
      if (this.onProgress) {
        this.onProgress(fileId, { received: chunkIndex + 1, total: totalChunks, isSending: true });
      }
      
      // Progress event for frontend (optional, emit via socketManager if needed)
      // await small delay to prevent JSON serialization blocking the event loop
      await new Promise(r => setTimeout(r, 2));
      chunkIndex++;
    }
    
    this.socketManager.sendMessage(toPeerId, toIp, Protocol.Types.FILE_TRANSFER_END, { fileId, hash: fileHash });
    return fileId;
  }

  handleStart(packet) {
    const payload = packet.payload;
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
      sha256: require('crypto').createHash('sha256')
    });
  }

  handleChunk(packet) {
    const payload = packet.payload;
    const transfer = this.activeReceives.get(payload.fileId);
    if (!transfer) return;
    
    const buffer = Buffer.from(payload.data, 'base64');
    transfer.stream.write(buffer);
    transfer.sha256.update(buffer);
    transfer.receivedCount++;
    
    if (this.onProgress) {
      this.onProgress(payload.fileId, { received: transfer.receivedCount, total: transfer.totalChunks, isSending: false });
    }
  }

  handleEnd(packet, onComplete, onError) {
    const payload = packet.payload;
    const transfer = this.activeReceives.get(payload.fileId);
    if (!transfer) return;
    
    transfer.stream.end();
    const finalHash = transfer.sha256.digest('hex');
    this.activeReceives.delete(payload.fileId);
    
    if (finalHash !== transfer.hash) {
      if (onError) onError('Hash mismatch! Transfer corrupted.');
      if (fs.existsSync(transfer.tempPath)) fs.unlinkSync(transfer.tempPath);
    } else {
      if (onComplete) onComplete(transfer.tempPath, transfer.fileName, payload.fileId);
    }
  }
}

module.exports = TransferManager;
