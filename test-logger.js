const fs = require('fs');
const path = require('path');

const cwd = process.cwd();
console.log('CWD:', cwd);

const userDataPath = path.join(cwd, 'userData');
const logsPath = path.join(userDataPath, 'logs');
const debugLogPath = path.join(logsPath, 'debug.log');

console.log('Target Log Path:', debugLogPath);

try {
    if (!fs.existsSync(logsPath)) {
        fs.mkdirSync(logsPath, { recursive: true });
    }
    fs.appendFileSync(debugLogPath, 'Test from script\n');
    console.log('Write success!');
} catch (e) {
    console.error('Write failed:', e);
}
