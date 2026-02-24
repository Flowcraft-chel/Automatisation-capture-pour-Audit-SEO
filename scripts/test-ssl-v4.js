import axios from 'axios';

async function testV4() {
    try {
        console.log("Testing v4 info endpoint...");
        const res = await axios.get('https://api.ssllabs.com/api/v4/info');
        console.log(res.data);
    } catch (e) {
        console.error("V4 failed:", e.response ? e.response.status : e.message);

        console.log("Testing v3 info endpoint...");
        try {
            const res3 = await axios.get('https://api.ssllabs.com/api/v3/info');
            console.log(res3.data);
        } catch (e3) {
            console.error("V3 failed:", e3.response ? e3.response.status : e3.message);
        }
    }
}
testV4();
