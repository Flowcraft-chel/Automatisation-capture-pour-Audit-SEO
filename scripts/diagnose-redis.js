import IORedis from 'ioredis';
import 'dotenv/config';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

console.log('--- DIAGNOSTIC REDIS ---');
console.log(`Tentative de connexion à : ${REDIS_URL}`);

const redis = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
});

redis.on('error', (err) => {
    console.error('\n❌ ERREUR DE CONNEXION :');
    console.error(`Code : ${err.code}`);
    console.error(`Message : ${err.message}`);

    if (err.code === 'ECONNREFUSED') {
        console.log('\n💡 SOLUTIONS POSSIBLES :');
        console.log('1. Redis n\'est pas lancé sur votre machine.');
        console.log('2. Si vous utilisez Docker, faites : docker run -d -p 6379:6379 redis');
        console.log('3. Si vous avez installé Redis sur Windows, vérifiez le service "Redis".');
        console.log('4. Si vous êtes sur Railway, cette erreur est normale en LOCAL si vous n\'avez pas configuré de tunnel.');
    }
    process.exit(1);
});

redis.on('connect', () => {
    console.log('\n✅ CONNEXION RÉUSSIE !');
    console.log('Redis est opérationnel.');
    process.exit(0);
});
