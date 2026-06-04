const { Server } = require("socket.io");

let io;

function initSocket(httpServer, { corsOrigin }) {
  io = new Server(httpServer, {
    cors: {
      origin: corsOrigin,
      credentials: true,
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    socket.on("join:conversation", (phone) => {
      if (typeof phone !== "string" || !phone.trim()) return;
      socket.join(`conversation:${phone.trim()}`);
    });

    socket.on("join:campaign", (campaignId) => {
      if (typeof campaignId !== "string" || !campaignId.trim()) return;
      socket.join(`campaign:${campaignId.trim()}`);
      console.log(`[socket] client joined campaign room: ${campaignId}`);
    });
  });

  return io;
}

function getIO() {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
}

module.exports = { initSocket, getIO };
