const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const ACCESS_PASSWORD = 'bharat-bazaar21'; // Change this

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
        
        // STEP 1: First, just read all the text
        const step1Request = {
            contents: [{
                parts: [
                    {
                        text: `Read this receipt image very carefully. Extract ALL text you can see, line by line. 

Focus especially on:
1. The table/list of items purchased
2. Each row should have: item code, description, quantity, unit price, and total amount
3. Read every single row - if there are 15 rows, list all 15
4. Also find: subtotal, tax, and final total at the bottom

Just list everything you see in plain text format, preserving the structure. Be thorough and complete.`
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
        
        const step1Response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(step1Request)
            }
        );

        if (!step1Response.ok) {
            const errorText = await step1Response.text();
            console.error('Step 1 Error:', errorText);
            return res.status(step1Response.status).json({ error: errorText });
        }

        const step1Data = await step1Response.json();
        const rawText = step1Data.candidates[0].content.parts[0].text;
        
        console.log('Raw text extracted:', rawText.substring(0, 500));
        
        // STEP 2: Now organize that text into JSON structure
        const step2Request = {
            contents: [{
                parts: [{
                    text: `Here is text extracted from a receipt:

${rawText}

Now organize this into a structured JSON format:
{
  "items": [
    {
      "description": "complete item description",
      "quantity": "quantity number",
      "unit_price": "price per unit",
      "amount": "total amount"
    }
  ],
  "subtotal": "subtotal amount",
  "tax": "tax amount",
  "total": "final total"
}

Rules:
- Include EVERY item from the list
- Use the EXACT text for descriptions
- Use the EXACT numbers for quantities and prices
- Do NOT skip any items
- Do NOT make up or modify data
- Return ONLY valid JSON, no other text`
                }]
            }]
        };
        
        const step2Response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(step2Request)
            }
        );

        if (!step2Response.ok) {
            const errorText = await step2Response.text();
            console.error('Step 2 Error:', errorText);
            return res.status(step2Response.status).json({ error: errorText });
        }

        const step2Data = await step2Response.json();
        const structuredText = step2Data.candidates[0].content.parts[0].text;
        
        console.log('Structured JSON:', structuredText.substring(0, 500));
        
        const claudeFormatResponse = {
            content: [
                {
                    type: 'text',
                    text: structuredText
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
    console.log('Using 2-step extraction for accuracy');
    console.log('========================================');
});