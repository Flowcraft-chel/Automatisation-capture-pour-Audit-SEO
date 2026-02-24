import axios from 'axios';

async function testApi() {
    try {
        console.log("Fetching detailed analysis...");
        const response = await axios.get('https://api.ssllabs.com/api/v3/analyze?host=google.com&all=on');
        const data = response.data;

        if (data.endpoints && data.endpoints.length > 0) {
            const ep = data.endpoints[0];
            console.log("Grade:", ep.grade);
            if (ep.details) {
                console.log("Details keys:", Object.keys(ep.details));
            } else {
                console.log("No details found. Status:", data.status);
                console.log("Fetching endpoint data explicitly for IP:", ep.ipAddress);
                const epRes = await axios.get(`https://api.ssllabs.com/api/v3/getEndpointData?host=google.com&s=${ep.ipAddress}`);
                const epData = epRes.data;
                if (epData.details) {
                    console.log("Explicit Cert Score:", epData.details.certScore);
                    console.log("Explicit Protocol Score:", epData.details.protocolsScore);
                    console.log("Explicit Key Score:", epData.details.keyScore);
                    console.log("Explicit Cipher Score:", epData.details.cipherScore);
                }
            }
        }
    } catch (e) {
        console.error(e);
    }
}
testApi();
