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

const retryRequest = async (config, retries = 5, delay = 3000) => {
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
            console.log('WEBHOOK_VERIFICATION_FAILED: Invalid token');
            res.sendStatus(403);
        }
    } else {
        console.log('WEBHOOK_VERIFICATION_FAILED: Missing mode or token');
        res.sendStatus(403);
    }
});

app.post('/webhook', (req, res) => {
    let body = req.body;
    console.log(`Received event from Facebook: ${JSON.stringify(body)}`);

    if (body.object === 'page') {
        body.entry.forEach(entry => {
            entry.messaging.forEach(event => {
                if (event.postback) {
                    const payload = event.postback.payload;
                    console.log(`Received postback event: Sender ID=${event.sender.id}, Payload=${payload}`);
                } else if (event.message) {
                    console.log(`Received message event: Sender ID=${event.sender.id}, Message=${event.message.text}`);
                } else {
                    console.log(`Received unknown event: ${JSON.stringify(event)}`);
                }

                console.log(`Forwarding event to webhook: ${WEBHOOK_URL}`);
                retryRequest({
                    method: 'post',
                    url: WEBHOOK_URL,
                    data: body
                })
                .then(response => {
                    console.log('Successfully forwarded event to webhook');
                })
                .catch(error => {
                    console.error(`Error forwarding event to webhook: ${error.message}`);
                });
            });
        });
        res.status(200).send('EVENT_RECEIVED');
    } else {
        console.log('Received non-page event, ignoring');
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
        console.log(`Sending message with quick replies to ${recipientId}: ${messageText}, Quick Replies=${JSON.stringify(quickReplies)}`);
    } else {
        console.log(`Sending message to ${recipientId}: ${messageText}`);
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
        console.log(`Message sent successfully to ${recipientId}: ${messageText}`);
        res.status(200).send('Message sent');
    })
    .catch(error => {
        console.error(`Error sending message: ${error.response ? JSON.stringify(error.response.data) : error.message}`);
        res.status(500).send('Error sending message');
    });
});

// Endpoint để thiết lập Persistent Menu ban đầu
app.post('/setup-persistent-menu', (req, res) => {
    const menuPayload = {
        persistent_menu: [
            {
                locale: "default",
                composer_input_disabled: false, // Không vô hiệu hóa ô nhập liệu
                call_to_actions: [
                    {
                        type: "postback",
                        title: "Dừng chat",
                        payload: "STOP_CHAT"
                    },
                    {
                        type: "postback",
                        title: "Tiếp tục chat",
                        payload: "RESUME_CHAT"
                    }
                ]
            }
        ]
    };

    retryRequest({
        method: 'post',
        url: `https://graph.facebook.com/v20.0/me/messenger_profile?access_token=${PAGE_ACCESS_TOKEN}`,
        data: menuPayload
    })
    .then(response => {
        console.log('Persistent Menu set successfully');
        res.status(200).send('Persistent Menu set successfully');
    })
    .catch(error => {
        console.error(`Error setting Persistent Menu: ${error.response ? error.response.data : error.message}`);
        res.status(500).send('Error setting Persistent Menu');
    });
});

// Endpoint để cập nhật Persistent Menu dựa trên trạng thái
app.post('/update-persistent-menu', (req, res) => {
    const state = req.body.state; // "start" hoặc "stopped"
    if (!state || !['start', 'stopped'].includes(state)) {
        console.error('Invalid state provided for updating Persistent Menu');
        return res.status(400).send('Invalid state');
    }

    const menuPayload = {
        persistent_menu: [
            {
                locale: "default",
                composer_input_disabled: false,
                call_to_actions: state === "stopped" ? [
                    {
                        type: "postback",
                        title: "Tiếp tục chat",
                        payload: "RESUME_CHAT"
                    }
                ] : [
                    {
                        type: "postback",
                        title: "Dừng chat",
                        payload: "STOP_CHAT"
                    }
                ]
            }
        ]
    };

    retryRequest({
        method: 'post',
        url: `https://graph.facebook.com/v20.0/me/messenger_profile?access_token=${PAGE_ACCESS_TOKEN}`,
        data: menuPayload
    })
    .then(response => {
        console.log(`Persistent Menu updated for state: ${state}`);
        res.status(200).send('Persistent Menu updated');
    })
    .catch(error => {
        console.error(`Error updating Persistent Menu: ${error.response ? error.response.data : error.message}`);
        res.status(500).send('Error updating Persistent Menu');
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
