const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const app = express();

app.use(bodyParser.json());

const WEBHOOK_URL = "https://huylaughmad-chatbot.hf.space/webhook";
const PAGE_ACCESS_TOKEN = "EAAeHPqDD8X4BO06OyYjGwZAv8IBkdMHlRXJMXqd3PBkDx1LocDZC4X1h7ZB19VirpXEVUUZBBZBF7UtruWpUdcgQQOjfsxw9O9BG5EYIkoK2iVZATnSSgRv8duVyfDGk0W5fJQypdBIikoB414joTfVOWLPqmKGuZBypqwS3NHZCSgKbKD6K6ceZAJB9ifMZBY96g2TYEDcWjHpFZCDg8XDpQZDZD";

const axiosInstance = axios.create({
    timeout: 15000,
});

const retryRequest = async (config, retries = 3, delay = 2000) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await axiosInstance(config);
        } catch (error) {
            if (i === retries - 1) throw error;
            console.log(`Retrying request (${i + 1}/${retries}) after ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
};

// Endpoint keep-alive
app.get('/keep-alive', (req, res) => {
    console.log('Received keep-alive request');
    res.status(200).send('OK');
});

app.get('/webhook', (req, res) => {
    const VERIFY_TOKEN = "TTL1979";
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    }
});

app.post('/webhook', (req, res) => {
    let body = req.body;
    console.log(`Received message for user: ${JSON.stringify(body)}`);

    if (body.object === 'page') {
        body.entry.forEach(entry => {
            entry.messaging.forEach(event => {
                console.log(`Forwarding to webhook: ${WEBHOOK_URL}`);
                retryRequest({
                    method: 'post',
                    url: WEBHOOK_URL,
                    data: body
                })
                .then(response => {
                    console.log('Successfully forwarded to webhook');
                })
                .catch(error => {
                    console.error(`Error forwarding to webhook: ${error.message}`);
                });
            });
        });
        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
});

app.post('/send-message', (req, res) => {
    let recipientId = req.body.recipient_id;
    let messageText = req.body.message_text;
    let quickReplies = req.body.quick_replies;

    let message = {
        text: messageText
    };

    if (quickReplies) {
        message.quick_replies = quickReplies;
    }

    retryRequest({
        method: 'post',
        url: `https://graph.facebook.com/v20.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
        data: {
            recipient: { id: recipientId },
            message: message,
            messaging_type: "RESPONSE"
        }
    })
    .then(response => {
        console.log(`Message sent to ${recipientId}: ${messageText}`);
        res.status(200).send('Message sent');
    })
    .catch(error => {
        console.error(`Error sending message: ${error.response ? error.response.data : error.message}`);
        res.status(500).send('Error sending message');
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
