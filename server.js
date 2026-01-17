const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Password protection
const ACCESS_PASSWORD = 'bharat-bazaar21'; // Change this to your password

// Serve login page
app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>Login - Receipt Scanner</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            margin: 0;
        }
        .login-box {
            background: white;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            width: 100%;
            max-width: 400px;
        }
        h1 {
            color: #333;
            margin-bottom: 30px;
            text-align: center;
        }
        input {
            width: 100%;
            padding: 12px;
            border: 2px solid #ddd;
            border-radius: 6px;
            font-size: 16px;
            margin-bottom: 20px;
            box-sizing: border-box;
        }
        button {
            width: 100%;
            padding: 12px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            font-weight: bold;
            cursor: pointer;
        }
        button:hover {
            background: #5568d3;
        }
        .error {
            color: #dc3545;
            text-align: center;
            margin-top: 10px;
            display: none;
        }
    </style>
</head>
<body>
    <div class="login-box">
        <h1>🔒 Receipt Scanner Login</h1>
        <input type="password" id="password" placeholder="Enter password" />
        <button onclick="login()">Login</button>
        <div class="error" id="error">Incorrect password!</div>
    </div>
    <script>
        function login() {
            const password = document.getElementById('password').value;
            fetch('/login', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({password})
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    sessionStorage.setItem('authenticated', 'true');
                    window.location.href = '/receipt-scanner.html';
                } else {
                    document.getElementById('error').style.display = 'block';
                }
            });
        }
        document.getElementById('password').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') login();
        });
    </script>
</body>
</html>
    `);
});

// Login endpoint
app.post('/login', (req, res) => {
    const { password } = req.body;
    if (password === ACCESS_PASSWORD) {
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

app.use(express.static('.'));

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

app.post('/api/extract', async (req, res) => {
    try {
        console.log('Processing receipt with Gemini 2.5 Flash...');
        
        const imageData = req.body.messages[0].content.find(c => c.type === 'image');
        const base64Image = imageData.source.data;
        
        const geminiRequest = {
            contents: [{
                parts: [
                    {
                        text: `Read this receipt image carefully. Extract ALL text you can see.

CRITICAL RULES:
1. Extract ONLY what you actually see - DO NOT make up or invent any data
2. Extract EVERY line item, product, or charge you can read
3. Find all numbers that represent prices, subtotals, tax, totals
4. If text is unclear or unreadable, skip it - do not guess
5. Return EXACTLY what is on the receipt, nothing more, nothing less

Return a JSON object with this structure:
{
  "items": [
    {"product": "exact text you see", "price": "exact price you see"}
  ],
  "subtotal": "value if visible, otherwise null",
  "tax": "value if visible, otherwise null", 
  "total": "value if visible, otherwise null",
  "raw_text": "any other important text you see"
}

If you cannot read something clearly, do not include it. Only include data you can actually see and read on the receipt. Return only valid JSON.`
                    },
                    {
                        inline_data: {
                            mime_type: 'image/png',
                            data: base64Image
                        }
                    }
                ]
            }]
        };
        
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(geminiRequest)
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini API Error:', errorText);
            return res.status(response.status).json({ error: errorText });
        }

        const data = await response.json();
        const geminiText = data.candidates[0].content.parts[0].text;
        
        console.log('AI Response:', geminiText);
        
        const claudeFormatResponse = {
            content: [
                {
                    type: 'text',
                    text: geminiText
                }
            ]
        };
        
        console.log('Success!');
        res.json(claudeFormatResponse);
        
    } catch (error) {
        console.error('Server Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('========================================');
    console.log('Server running on port', PORT);
    console.log('Using Gemini 2.5 Flash API');
    console.log('========================================');
});