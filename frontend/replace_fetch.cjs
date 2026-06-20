const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src');

function walkDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
            walkDir(filePath);
        } else if (file.endsWith('.jsx') || file.endsWith('.js')) {
            let content = fs.readFileSync(filePath, 'utf8');
            const originalContent = content;
            
            // Regex to replace fetch('/api/...') with fetch(`${import.meta.env.VITE_API_URL || ''}/api/...`)
            // We look for fetch('/api/ and fetch("/api/
            content = content.replace(/fetch\(\s*['"](\/api\/[^'"]+)['"]/g, 'fetch(`${import.meta.env.VITE_API_URL || \'\'}$1`');
            
            if (content !== originalContent) {
                fs.writeFileSync(filePath, content, 'utf8');
                console.log(`Updated ${filePath}`);
            }
        }
    }
}

walkDir(srcDir);
console.log("Done");
