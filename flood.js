const readline = require('readline-sync');
const Kahoot = require('kahoot.js-latest');
const words = require('an-array-of-english-words');
const random = require('random-name');

process.setMaxListeners(Infinity);

function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomName() {
    const style = randInt(1, 4);
    if (style === 1) return random.first() + random.last();
    if (style === 2) return random.first() + random.middle() + random.last();
    if (style === 3) return random.first();
    return words[randInt(0, words.length - 1)];
}

function applyBypass(name) {
    const map = {
        a:'ᗩ',b:'ᗷ',c:'ᑕ',d:'ᗪ',e:'E',f:'ᖴ',g:'G',h:'ᕼ',i:'I',j:'ᒍ',
        k:'K',l:'ᒪ',m:'ᗰ',n:'ᑎ',o:'O',p:'ᑭ',q:'ᑫ',r:'ᖇ',s:'ᔕ',t:'T',
        u:'ᑌ',v:'ᐯ',w:'ᗯ',x:'᙭',y:'Y',z:'ᘔ'
    };
    return name.toLowerCase().split('').map(c => map[c] || c).join('');
}

function printBanner() {
    console.clear();
    console.log('========================================');
    console.log('         KAHOOT BOT FLOODER v2.0        ');
    console.log('       Powered by kahoot.js-latest      ');
    console.log('========================================');
    console.log('  Use at your own risk. Educational use only.');
    console.log('========================================\n');
}

printBanner();

const pin        = readline.question('Game PIN: ');
const botCount   = parseInt(readline.question('Number of bots: '), 10);
const useRandom  = readline.keyInYN('Use random names?');
const botName    = useRandom ? null : readline.question('Bot name prefix: ');
const useBypass  = readline.keyInYN('Use name bypass (unicode trick)?');
const autoAnswer = readline.keyInYN('Auto-answer randomly?');

console.clear();
console.log(`\nLaunching ${botCount} bots into game ${pin}...\n`);

let joined = 0;
let failed = 0;
let sharedAnswer = null;

function getBotName(index) {
    let name = useRandom ? randomName() : `${botName}${index}`;
    if (useBypass) name = applyBypass(name);
    return name;
}

function spawnBot(index) {
    const name = getBotName(index);
    const client = new Kahoot();
    client.setMaxListeners(Infinity);

    client.join(pin, name).catch(err => {
        const msg = (err && (err.description || err.message)) || String(err);
        if (msg.toLowerCase().includes('duplicate') && useRandom) {
            setTimeout(() => spawnBot(index), 200);
        } else {
            failed++;
            console.log(`[FAIL] Bot ${index} — ${msg}`);
        }
    });

    client.on('Joined', () => {
        joined++;
        console.log(`[JOIN] ${name} joined. (${joined}/${botCount})`);
    });

    client.on('QuestionStart', question => {
        const numAnswers = (question.quizQuestionAnswers && question.quizQuestionAnswers[question.questionIndex]) || 4;
        const delay = randInt(500, 4000);

        if (!autoAnswer && index === 0) {
            let ans;
            if (question.type === 'quiz' || question.type === 'survey') {
                console.log(`\n[QUESTION] ${numAnswers} choices. Enter 1-${numAnswers}:`);
                ans = parseInt(readline.question('Your answer: '), 10) - 1;
                sharedAnswer = ans;
            } else {
                ans = readline.question('Your answer: ');
                sharedAnswer = ans;
            }
            setTimeout(() => question.answer(ans), delay);
        } else if (!autoAnswer && index !== 0) {
            const wait = setInterval(() => {
                if (sharedAnswer !== null) {
                    clearInterval(wait);
                    setTimeout(() => question.answer(sharedAnswer), delay);
                    sharedAnswer = null;
                }
            }, 100);
        } else {
            if (question.type === 'word_cloud' || question.type === 'open_ended') {
                setTimeout(() => question.answer(words[randInt(0, words.length - 1)]), delay);
            } else {
                setTimeout(() => question.answer(randInt(0, numAnswers - 1)), delay);
            }
        }
    });

    client.on('QuestionEnd', data => {
        if (data && data.isCorrect) {
            console.log(`[CORRECT] ${name}`);
        }
    });

    client.on('QuizEnd', data => {
        if (data) console.log(`[END] ${name} finished — Rank: ${data.rank}`);
    });

    client.on('Disconnect', reason => {
        if (reason !== 'Quiz Locked') {
            setTimeout(() => spawnBot(index), 1000);
        }
    });
}

for (let i = 0; i < botCount; i++) {
    setTimeout(() => spawnBot(i), i * randInt(100, 300));
}

process.on('SIGINT', () => {
    console.log(`\nStopped. ${joined} joined, ${failed} failed.`);
    process.exit();
});
