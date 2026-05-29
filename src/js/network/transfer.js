const Protocol = require('./protocol');
const path = require('path');
const os = require('os');
const fs = require('fs');

class TransferManager {
  constructor(socketManager) {
    this.socketManager = socketManager;
    this.CHUNK_SIZE = 64 * 1024; // 64KB
    
    // tracking active receiving transfers: { fileId: { metadata, chunks: [], receivedChunks: 0 } }
    this.activeReceives = new Map(); 
  }

  // Called from main process when UI wants to send a file
  async sendFile(toPeerId, toIp, filePath) {
    if (!fs.existsSync(filePath)) return false;

    const stats = fs.statSync(filePath);
    if (stats.size > 500 * 1024 * 1024) {
      throw new Error("File exceeds 500MB limit.");
    }

    const fileName = path.basename(filePath);
    const fileId = window.orbitAPI ? window.orbitAPI.getUuid() : require('uuid').v4(); // Generate unique ID
    const totalChunks = Math.ceil(stats.size / this.CHUNK_SIZE);

    // Read and send in chunks
    // In a real app we would use streams to avoid reading 500MB into memory all at once.
    // For simplicity, we use sync read or simple async stream here.
    const fileBuffer = fs.readFileSync(filePath);
    
    for (let i = 0; i < totalChunks; i++) {
      const start = i * this.CHUNK_SIZE;
      const end = Math.min(start + this.CHUNK_SIZE, fileBuffer.length);
      const chunkData = fileBuffer.subarray(start, end).toString('base64');

      const payload = {
        fileId: fileId,
        fileName: fileName,
        fileSize: stats.size,
        chunkIndex: i,
        totalChunks: totalChunks,
        data: chunkData
      };

      // Use socket manager to send chunk
      this.socketManager.sendMessage(toPeerId, toIp, Protocol.Types.FILE_CHUNK, payload);
    }

    return fileId;
  }

  // Handle incoming chunk
  handleChunk(packet, onComplete) {
    const payload = packet.payload;
    const fileId = payload.fileId;

    if (!this.activeReceives.has(fileId)) {
      this.activeReceives.set(fileId, {
        fileName: payload.fileName,
        fileSize: payload.fileSize,
        totalChunks: payload.totalChunks,
        chunks: new Array(payload.totalChunks),
        receivedCount: 0
      });
    }

    const transfer = this.activeReceives.get(fileId);
    
    // Only process if we don't already have this chunk
    if (!transfer.chunks[payload.chunkIndex]) {
      transfer.chunks[payload.chunkIndex] = Buffer.from(payload.data, 'base64');
      transfer.receivedCount++;
      
      // Check if complete
      if (transfer.receivedCount === transfer.totalChunks) {
        // Reassemble and save
        const fullBuffer = Buffer.concat(transfer.chunks);
        const downloadsDir = path.join(os.homedir(), 'Downloads', 'Orbit');
        if (!fs.existsSync(downloadsDir)) {
          fs.mkdirSync(downloadsDir, { recursive: true });
        }
        
        const savePath = path.join(downloadsDir, transfer.fileName);
        fs.writeFileSync(savePath, fullBuffer);
        
        this.activeReceives.delete(fileId);
        
        // Notify completion
        if (onComplete) onComplete(savePath, payload.fileName);
      }
    }
  }
}

module.exports = TransferManager;
