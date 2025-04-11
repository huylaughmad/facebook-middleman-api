const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// Lấy PAGE_ACCESS_TOKEN từ biến môi trường (sẽ cấu hình trên Render)
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

app.post("/send-message", async (req, res) => {
    const { recipient_id, message_text } = req.body;

    if (!recipient_id || !message_text) {
        return res.status(400).json({ error: "Missing recipient_id or message_text" });
    }

    const payload = {
        recipient: { id: recipient_id },
        message: { text: message_text },
        messaging_type: "RESPONSE"
    };

    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${PAGE_ACCESS_TOKEN}`
    };

    try {
        const response = await axios.post(
            "https://graph.facebook.com/v18.0/me/messages",
            payload,
            { headers }
        );
        res.status(200).json({ success: true, data: response.data });
    } catch (error) {
        console.error("Error sending message:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: "Failed to send message", details: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
