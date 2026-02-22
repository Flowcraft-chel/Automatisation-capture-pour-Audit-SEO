import axios from 'axios';

async function testApi() {
    console.log('--- TEST API LOCAL ---');
    try {
        const health = await axios.get('http://localhost:5000/api/health');
        console.log('Health:', health.data);
    } catch (err) {
        console.error('Health Error:', err.response?.data || err.message);
    }
}

testApi();
