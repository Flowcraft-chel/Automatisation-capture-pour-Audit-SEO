import axios from 'axios';

async function testRegister() {
    try {
        const response = await axios.post('http://localhost:5000/api/auth/register', {
            email: 'test@example.com',
            password: 'Password123!'
        });
        console.log('Register Success:', response.data);
    } catch (error) {
        console.error('Register Fail:', error.response ? error.response.status : error.message, error.response ? error.response.data : '');
    }
}

testRegister();
