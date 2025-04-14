const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const app = express();

app.use(bodyParser.json());

const WEBHOOK_URL = "https://huylaughmad-chatbot.hf.space/webhook";
const PAGE_ACCESS_TOKEN = "EAAeHPqDD8X4BO8SSZAkrTlLaabHy5gNsywm4H7lySXGvNsExfjxlDAoj1TdKq1KtLRtZCBZAVuNXBJ9w85RqA5gD13pWoxDqqhPcqbO9gLZAm7K5937miW2mjVPdBYAN5uRSUopVJXbzaaG0pONPJ6GnTTdFinsAH99HyyqiBdUFTKjhf6WOjyraj55MQ97pnCNQrw2CUTDRca595wZDZD";

const axiosInstance = axios.create({
    timeout: 180000, // Tăng timeout lên 60 giây để chờ Hugging Face Spaces khởi động
});

const retryRequest = async (config, retries = 5, delay = 3000) => {
    for (let i = 0; i < retries; i++) {
        try {
            console.log(`Attempt ${i + 1}/${retries} to ${config.url} with method ${config.method}`);
            const response = await axiosInstance(config);
            console.log(`Request to ${config.url} succeeded with status: ${response.status}`);
            return response;
        } catch (error) {
            console.error(`Attempt ${i + 1}/${retries} failed: ${error.message}`);
            if (i === retries - 1) {
                console.error(`All ${retries} attempts failed for ${config.url}: ${error.message}`);
                throw error;
            }
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

// Xác minh webhook
app.get('/webhook', (req, res) => {
    const VERIFY_TOKEN = "TTL1979";
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];

    console.log(`Received webhook verification request: mode=${mode}, token=${token}, challenge=${challenge}`);

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

// Xử lý webhook từ Facebook
app.post('/webhook', (req, res) => {
    let body = req.body;
    console.log(`Received event from Facebook: ${JSON.stringify(body)}`);

    if (body.object === 'page') {
        if (!body.entry || !Array.isArray(body.entry)) {
            console.error('Invalid entry in payload: missing or not an array');
            return res.status(400).send('Invalid payload');
        }

        body.entry.forEach(entry => {
            if (!entry.messaging || !Array.isArray(entry.messaging)) {
                console.error(`Invalid messaging in entry: ${JSON.stringify(entry)}`);
                return;
            }

            entry.messaging.forEach(event => {
                if (event.postback) {
                    const payload = event.postback.payload;
                    console.log(`Received postback event: Sender ID=${event.sender?.id || 'unknown'}, Payload=${payload}`);
                } else if (event.message) {
                    console.log(`Received message event: Sender ID=${event.sender?.id || 'unknown'}, Message=${event.message.text || 'no text'}`);
                } else if (event.delivery) {
                    console.log(`Received delivery event: Sender ID=${event.sender?.id || 'unknown'}`);
                } else if (event.read) {
                    console.log(`Received read event: Sender ID=${event.sender?.id || 'unknown'}`);
                } else {
                    console.log(`Received unknown event: ${JSON.stringify(event)}`);
                }

                console.log(`Forwarding event to webhook: ${WEBHOOK_URL}`);
                retryRequest({
                    method: 'post',
                    url: WEBHOOK_URL,
                    data: body,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                })
                .then(response => {
                    console.log(`Successfully forwarded event to webhook: Status ${response.status}, Response: ${JSON.stringify(response.data)}`);
                })
                .catch(error => {
                    console.error(`Error forwarding event to webhook: ${error.message}`);
                    if (error.response) {
                        console.error(`Webhook response: Status ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`);
                    }
                });
            });
        });
        res.status(200).send('EVENT_RECEIVED');
    } else {
        console.log('Received non-page event, ignoring');
        res.sendStatus(404);
    }
});

// Gửi tin nhắn
app.post('/send-message', (req, res) => {
    let recipientId = req.body.recipient_id;
    let messageText = req.body.message_text;
    let quickReplies = req.body.quick_replies;

    if (!recipientId || !messageText) {
        console.error(`Invalid send-message request: recipientId=${recipientId}, messageText=${messageText}`);
        return res.status(400).send('Missing recipient_id or message_text');
    }

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
        url: `https://graph.facebook.com/v21.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
        data: {
            recipient: { id: recipientId },
            message: message,
            messaging_type: "RESPONSE"
        }
    })
    .then(response => {
        console.log(`Message sent successfully to ${recipientId}: ${messageText}, Response: ${JSON.stringify(response.data)}`);
        res.status(200).send('Message sent');
    })
    .catch(error => {
        console.error(`Error sending message to ${recipientId}: ${error.message}`);
        if (error.response) {
            console.error(`Facebook API response: Status ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`);
        }
        res.status(500).send('Error sending message');
    });
});

// Thiết lập Persistent Menu ban đầu
app.post('/setup-persistent-menu', (req, res) => {
    const menuPayload = {
        persistent_menu: [
            {
                locale: "default",
                composer_input_disabled: false,
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

    console.log('Setting up Persistent Menu with payload:', JSON.stringify(menuPayload));
    retryRequest({
        method: 'post',
        url: `https://graph.facebook.com/v21.0/me/messenger_profile?access_token=${PAGE_ACCESS_TOKEN}`,
        data: menuPayload
    })
    .then(response => {
        console.log('Persistent Menu set successfully:', JSON.stringify(response.data));
        res.status(200).send('Persistent Menu set successfully');
    })
    .catch(error => {
        console.error(`Error setting Persistent Menu: ${error.message}`);
        if (error.response) {
            console.error(`Facebook API response: Status ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`);
        }
        res.status(500).send('Error setting Persistent Menu');
    });
});

// Lấy cấu hình Persistent Menu hiện tại
app.get('/get-persistent-menu', (req, res) => {
    console.log('Fetching current Persistent Menu');
    retryRequest({
        method: 'get',
        url: `https://graph.facebook.com/v21.0/me/messenger_profile?fields=persistent_menu&access_token=${PAGE_ACCESS_TOKEN}`
    })
    .then(response => {
        console.log('Current Persistent Menu:', JSON.stringify(response.data));
        res.status(200).json(response.data);
    })
    .catch(error => {
        console.error(`Error fetching Persistent Menu: ${error.message}`);
        if (error.response) {
            console.error(`Facebook API response: Status ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`);
        }
        res.status(500).send('Error fetching Persistent Menu');
    });
});

// Xóa Persistent Menu (nếu cần)
app.post('/delete-persistent-menu', (req, res) => {
    console.log('Deleting Persistent Menu');
    retryRequest({
        method: 'delete',
        url: `https://graph.facebook.com/v21.0/me/messenger_profile?access_token=${PAGE_ACCESS_TOKEN}`,
        data: {
            fields: ["persistent_menu"]
        }
    })
    .then(response => {
        console.log('Persistent Menu deleted successfully:', JSON.stringify(response.data));
        res.status(200).send('Persistent Menu deleted successfully');
    })
    .catch(error => {
        console.error(`Error deleting Persistent Menu: ${error.message}`);
        if (error.response) {
            console.error(`Facebook API response: Status ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`);
        }
        res.status(500).send('Error deleting Persistent Menu');
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
