const cluster = require('node:cluster');
const http = require('node:http');
const os = require('node:os');
const process = require('node:process');
const express = require("express");
const { Server } = require("socket.io");
const cors = require('cors');
require('dotenv').config();

const numCPUs = os.availableParallelism();

if (cluster.isPrimary) {
    console.log(`Primary ${process.pid} is running`);

    // Fork workers.
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`worker ${worker.process.pid} died`);
        // Optionally fork a new worker when one dies
        cluster.fork();
    });
} else {
    const app = express();
    const port = process.env.PORT || 3002;
    const server = http.createServer(app);

    // Configure CORS for Express
    app.use(cors({
        origin: "*", // Replace "*" with your frontend's URL in production
        methods: ["GET", "POST"],
        allowedHeaders: ["Content-Type"],
        credentials: true
    }));

    // Socket.IO configuration
    const io = new Server(server, {
        cors: {
            origin: "*", // Replace "*" with your frontend's URL in production
            methods: ["GET", "POST"],
            allowedHeaders: ["Content-Type"],
            credentials: true
        }
    });

    // Middleware to parse JSON bodies
    app.use(express.json());

    // Import and setup routes
    const setupRoutes = require('./routes');
    setupRoutes(app, io);

    server.listen(port, () => {
        console.log(`Server listening on port ${port}`);
    });

    console.log(`Worker ${process.pid} started`);
}
