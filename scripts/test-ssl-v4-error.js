import axios from 'axios';

async function testV4Error() {
    try {
        const res = await axios.get('https://api.ssllabs.com/api/v4/analyze?host=notion.so&all=done', {
            headers: { email: 'contact@novek.fr' }
        });
    } catch (e) {
        if (e.response) {
            console.error("V4 failed:", e.response.status);
            console.error(e.response.data);
        } else {
            console.error("V4 failed:", e.message);
        }
    }
}
testV4Error();
