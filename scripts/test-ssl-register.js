import axios from 'axios';

async function registerV4() {
    try {
        console.log("Registering email for v4...");
        const res = await axios.post('https://api.ssllabs.com/api/v4/register', {
            firstName: "Novek",
            lastName: "Admin",
            email: "contact@novekai.agency", // REQUIRED for v4
            organization: "Novek"
        });
        console.log("Success:", res.data);
    } catch (e) {
        if (e.response) {
            console.error("V4 Registration failed:", e.response.status);
            console.error(e.response.data);
        } else {
            console.error("V4 Registration failed:", e.message);
        }
    }
}
registerV4();
