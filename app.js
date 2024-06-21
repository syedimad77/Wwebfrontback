const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3002;
const server = http.createServer(app);

// Configure CORS for Express
app.use(cors());

// Socket.IO configuration
const io = new Server(server, {
    cors: {
        origin: "*", // Replace with your frontend's URL
        methods: ["GET", "POST"],
        allowedHeaders: ["Content-Type"],
        credentials: true
    }
});

// Import and setup routes
const setupRoutes = require('./routes');
setupRoutes(app, io);

server.listen(port, () => {
    console.log(`Server listening on the port::${port}`);
});
