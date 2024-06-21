const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const bodyParser = require('body-parser');

const allSessionsObject = {};

const validateClientId = (id) => {
    const regex = /^[a-zA-Z0-9_-]+$/;
    return regex.test(id);
};

const createWhatsappSession = (id, socket) => {
    if (!validateClientId(id)) {
        socket.emit("error", { message: "Invalid clientId. Only alphanumeric characters, underscores, and hyphens are allowed." });
        return;
    }

    if (allSessionsObject[id]) {
        socket.emit("error", { message: "Session already exists. Please use a unique session ID." });
        return;
    }

    const client = new Client({
        puppeteer: {
            headless: true,
        },
        webVersionCache: {
            type: "remote",
            remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
        },
        authStrategy: new LocalAuth({
            clientId: id,
        }),
    });

    client.on('qr', (qr) => {
        console.log('QR RECEIVED', qr);
        socket.emit("qr", { qr });
    });

    client.on("authenticated", () => {
        console.log("AUTHENTICATED");
    });

    client.on('ready', () => {
        console.log('Client is ready!');
        allSessionsObject[id] = client;
        socket.emit('ready', { id, message: "Client is ready!" });
    });

    client.on('message', msg => {
        if (msg.body === '!ping') {
            msg.reply('pong');
        }
    });

    client.initialize();
};

const sendMessageWithDelay = async (client, number, personalizedMessage, file) => {
    return new Promise(resolve => {
        setTimeout(async () => {
            try {
                if (file) {
                    await client.sendMessage(number, file, { caption: personalizedMessage });
                } else {
                    await client.sendMessage(number, personalizedMessage);
                }
                resolve();
            } catch (error) {
                console.error('Error sending message:', error);
                resolve();
            }
        }, Math.floor(Math.random() * (70000 - 30000 + 1) + 30000)); // Random delay between 30 to 70 seconds
    });
};

const setupRoutes = (app, io) => {
    // Use body-parser middleware
    app.use(bodyParser.json());

    // multer Logic
    const uploadStorage = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, './uploads');
        },
        filename: (req, file, cb) => {
            cb(null, Date.now() + '-' + file.originalname);
        }
    });

    const storageUpload = multer({ storage: uploadStorage });

    app.use((req, res, next) => {
        console.log('File upload request:', req.file);
        next();
    });

    // Rate limiter for sending messages
    const sendMessageLimiter = rateLimit({
        windowMs: 30 * 60 * 1000, // 30 minutes
        max: 100, // limit each IP to 100 requests per windowMs
        message: "Too many messages sent from this IP, please try again after a while"
    });

    // WebSocket Events
    io.on("connection", (socket) => {
        console.log("A user connected", socket.id);

        socket.on("createSession", (data) => {
            console.log("Create session data received:", data);
            const { id } = data;
            createWhatsappSession(id, socket);
        });

        socket.on("connected", (data) => {
            console.log("Connected to the server", data);
            socket.emit("hello", "Hello from server");
        });

        socket.on("disconnect", () => {
            console.log("User disconnected");
        });
    });

    // Routes

    // POST /postlogin
    app.post('/postlogin', (req, res) => {
        const { username, password } = req.body;

        // Dummy authentication check
        if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
            res.status(200).json({ message: 'Login successful' });
        } else {
            res.status(401).json({ error: 'Invalid username or password' });
        }
    });

    // POST /sendmessage
    app.post('/sendmessage', sendMessageLimiter, storageUpload.single('file'), async (req, res) => {
        const { clientId, numbers, messages } = req.body;

        if (!clientId) {
            return res.status(400).json({ error: 'Client ID is required' });
        }

        if (!allSessionsObject[clientId]) {
            return res.status(400).json({ error: 'Client session not found. Please create a session first.' });
        }

        try {
            const client = allSessionsObject[clientId];
            const numbersArray = numbers.split(',').map(number => number.trim() + "@c.us");
            const file = req.file ? MessageMedia.fromFilePath(req.file.path) : null;

            let uniqueIdentifiers = numbersArray.map((_, index) => `Person${index + 1}`);

            for (let i = 0; i < numbersArray.length; i++) {
                let personalizedMessage = `${messages} ${uniqueIdentifiers[i]}`;
                await sendMessageWithDelay(client, numbersArray[i], personalizedMessage, file);
            }

            res.json({ success: 'Messages sent successfully' });
        } catch (err) {
            console.error('Error handling file upload:', err);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });
};

module.exports = setupRoutes;
