const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration paths
const ENV_FILE = path.join(__dirname, '.env');
const OUTPUT_DIR = path.join(__dirname, 'output');
const DEFAULT_TEMPLATE = path.join(__dirname, 'template.html');
const FALLBACK_TEMPLATE = path.join(__dirname, 'barber-template.html');
const CSV_FILE = path.join(__dirname, 'data.csv');

// List of standard asset folders to copy to output if they exist
const ASSET_FOLDERS = ['css', 'js', 'images', 'assets', 'img', 'lib'];

// 1. Simple helper to load .env variables without external dependencies
function loadEnv() {
    if (fs.existsSync(ENV_FILE)) {
        const envContent = fs.readFileSync(ENV_FILE, 'utf8');
        envContent.split(/\r?\n/).forEach(line => {
            // Match KEY=VALUE (ignoring comments and spaces)
            const match = line.match(/^\s*([\w.\-]+)\s*=\s*(.*)?\s*$/);
            if (match && !line.trim().startsWith('#')) {
                const key = match[1];
                let value = match[2] || '';
                // Strip quotes if they exist
                if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                process.env[key] = value.trim();
            }
        });
    }
}

// Load environment variables
loadEnv();

/**
 * Slugifies a string to make it safe for filenames and URLs.
 */
function slugify(text) {
    if (!text) return '';
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')           // Replace spaces with -
        .replace(/[^\w\-]+/g, '')       // Remove all non-word chars (except -)
        .replace(/\-\-+/g, '-')         // Replace multiple - with single -
        .replace(/^-+/, '')             // Trim - from start
        .replace(/-+$/, '');            // Trim - from end
}

/**
 * Parses CSV content, handling quoted fields, commas inside quotes, and different line endings.
 */
function parseCSV(content) {
    const lines = [];
    let row = [];
    let inQuotes = false;
    let currentValue = '';
    
    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        const nextChar = content[i + 1];
        
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentValue += '"';
                i++; // Skip next quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            row.push(currentValue.trim());
            currentValue = '';
        } else if ((char === '\r' || char === '\n') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') {
                i++; // Skip \n
            }
            row.push(currentValue.trim());
            if (row.some(val => val !== '')) {
                lines.push(row);
            }
            row = [];
            currentValue = '';
        } else {
            currentValue += char;
        }
    }
    
    if (currentValue || row.length > 0) {
        row.push(currentValue.trim());
        if (row.some(val => val !== '')) {
            lines.push(row);
        }
    }
    
    return lines;
}

/**
 * Recursively copies a folder
 */
function copyFolderSync(from, to) {
    if (!fs.existsSync(from)) return;
    fs.mkdirSync(to, { recursive: true });
    fs.readdirSync(from).forEach(element => {
        const sourcePath = path.join(from, element);
        const destPath = path.join(to, element);
        if (fs.lstatSync(sourcePath).isDirectory()) {
            copyFolderSync(sourcePath, destPath);
        } else {
            fs.copyFileSync(sourcePath, destPath);
        }
    });
}

/**
 * Creates dummy/sample files if the user doesn't have them yet.
 */
function checkOrCreateSampleFiles() {
    if (!fs.existsSync(DEFAULT_TEMPLATE) && !fs.existsSync(FALLBACK_TEMPLATE)) {
        console.log('ℹ️ No template file found. Creating a sample template.html...');
        const sampleTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Welcome to {BUSINESS_NAME} in {CITY}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #1e1e24 0%, #111115 100%);
            color: #f5f0e8;
            margin: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            text-align: center;
        }
        .card {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            padding: 40px;
            border-radius: 16px;
            max-width: 500px;
            box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
        }
        h1 {
            color: #c9a96e;
            font-size: 2.5rem;
            margin-bottom: 10px;
        }
        p {
            color: #a09a8e;
            font-size: 1.1rem;
            line-height: 1.6;
        }
        .btn {
            display: inline-block;
            margin-top: 20px;
            padding: 12px 30px;
            background-color: #c9a96e;
            color: #111115;
            text-decoration: none;
            font-weight: bold;
            border-radius: 6px;
            transition: 0.3s;
        }
        .btn:hover {
            background-color: #e8d5a3;
            transform: translateY(-2px);
        }
    </style>
</head>
<body>
    <div class="card">
        <h1>{BUSINESS_NAME}</h1>
        <p>Premium local services in the heart of <strong>{CITY}</strong>.</p>
        <p>We combine modern techniques with classic hospitality to give you the ultimate experience. Come visit us in {CITY}!</p>
        <a href="#" class="btn">Book Appointment</a>
    </div>
</body>
</html>`;
        fs.writeFileSync(DEFAULT_TEMPLATE, sampleTemplate, 'utf8');
    }

    if (!fs.existsSync(CSV_FILE)) {
        console.log('ℹ️ No data.csv found. Creating a sample data.csv...');
        const sampleCSV = `business_name,city
Squire's Grooming Lounge,Austin
The Golden Shear,Dallas
Gentlemen's Cut,Houston
Metro Barbers,San Antonio
Apex Hair Studio,Fort Worth`;
        fs.writeFileSync(CSV_FILE, sampleCSV, 'utf8');
    }
}

/**
 * Automatically deploys output/ to Cloudflare Pages using Wrangler CLI.
 */
function deployToCloudflare() {
    const token = process.env.CLOUDFLARE_API_TOKEN;
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const projectName = process.env.CLOUDFLARE_PROJECT_NAME;

    if (!token || token.includes('PASTE_YOUR_API_TOKEN') || !accountId || !projectName) {
        console.log('ℹ️ Auto-deployment skipped. Cloudflare credentials not fully set in .env.');
        return;
    }

    console.log('\n☁️ Deploying generated pages to Cloudflare Pages...');
    try {
        // Wrangler picks up CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID from process.env automatically
        console.log(`Running Wrangler: Deploying output/ to project "${projectName}"...`);
        
        // npx wrangler pages deploy <directory> --project-name <project-name>
        const deployCmd = `npx wrangler pages deploy "${OUTPUT_DIR}" --project-name "${projectName}"`;
        const output = execSync(deployCmd, {
            env: {
                ...process.env,
                CLOUDFLARE_API_TOKEN: token,
                CLOUDFLARE_ACCOUNT_ID: accountId
            },
            stdio: 'inherit' // Inherit stdout/stderr to print live progress in the terminal
        });
        
        console.log('🎉 Cloudflare deployment finished successfully!');
    } catch (error) {
        console.error('❌ Cloudflare Pages deployment failed:', error.message);
    }
}

function main() {
    console.log('🚀 HTML Generation Script Started');

    checkOrCreateSampleFiles();

    let templatePath = DEFAULT_TEMPLATE;
    if (!fs.existsSync(DEFAULT_TEMPLATE)) {
        if (fs.existsSync(FALLBACK_TEMPLATE)) {
            console.log(`ℹ️ template.html not found, using existing template: ${path.basename(FALLBACK_TEMPLATE)}`);
            templatePath = FALLBACK_TEMPLATE;
        } else {
            console.error('❌ Error: No template file available.');
            process.exit(1);
        }
    } else {
        console.log(`📄 Using template: ${path.basename(templatePath)}`);
    }

    let templateContent;
    try {
        templateContent = fs.readFileSync(templatePath, 'utf8');
    } catch (err) {
        console.error(`❌ Failed to read template file: ${err.message}`);
        process.exit(1);
    }

    if (!fs.existsSync(CSV_FILE)) {
        console.error('❌ Error: data.csv not found.');
        process.exit(1);
    }

    let csvContent;
    try {
        csvContent = fs.readFileSync(CSV_FILE, 'utf8');
    } catch (err) {
        console.error(`❌ Failed to read data.csv: ${err.message}`);
        process.exit(1);
    }

    const rows = parseCSV(csvContent);
    if (rows.length < 2) {
        console.error('❌ Error: data.csv is empty or does not contain enough data.');
        process.exit(1);
    }

    const headerRow = rows[0];
    const normalizedHeaders = headerRow.map(h => h.toLowerCase().replace(/['"_\s\-]+/g, ''));
    
    let businessNameIdx = normalizedHeaders.findIndex(h => h === 'businessname' || h === 'name' || h.includes('business'));
    let cityIdx = normalizedHeaders.findIndex(h => h === 'city' || h === 'location' || h.includes('city'));

    if (businessNameIdx === -1) {
        console.log('⚠️ Could not automatically detect "business_name" column. Defaulting to first column.');
        businessNameIdx = 0;
    }
    if (cityIdx === -1) {
        console.log('⚠️ Could not automatically detect "city" column. Defaulting to second column.');
        cityIdx = 1;
    }

    console.log(`📊 Headers mapped: Business Name Column -> "${headerRow[businessNameIdx]}", City Column -> "${headerRow[cityIdx]}"`);

    console.log(`🧹 Cleaning output directory: ${OUTPUT_DIR}`);
    if (fs.existsSync(OUTPUT_DIR)) {
        fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    let copiedAssets = [];
    const templateDir = path.dirname(templatePath);
    ASSET_FOLDERS.forEach(folder => {
        const sourceFolder = path.join(templateDir, folder);
        if (fs.existsSync(sourceFolder) && fs.lstatSync(sourceFolder).isDirectory()) {
            console.log(`📁 Copying asset folder "${folder}" to output/`);
            copyFolderSync(sourceFolder, path.join(OUTPUT_DIR, folder));
            copiedAssets.push(folder);
        }
    });

    const dataRows = rows.slice(1);
    let successCount = 0;
    let skipCount = 0;

    dataRows.forEach((row, index) => {
        const businessName = row[businessNameIdx];
        const city = row[cityIdx];

        if (!businessName || !city) {
            console.log(`⚠️ Line ${index + 2}: Skipping row due to missing values.`);
            skipCount++;
            return;
        }

        const businessSlug = slugify(businessName);
        const citySlug = slugify(city);
        const fileName = `${businessSlug}-${citySlug}.html`;
        const outputPath = path.join(OUTPUT_DIR, fileName);

        let pageContent = templateContent;
        const replacements = [
            { key: 'BUSINESS_NAME', value: businessName },
            { key: 'CITY', value: city }
        ];

        replacements.forEach(({ key, value }) => {
            const regexes = [
                new RegExp(`{{\\s*${key}\\s*}}`, 'g'),
                new RegExp(`{\\s*${key}\\s*}`, 'g')
            ];
            
            regexes.forEach(regex => {
                pageContent = pageContent.replace(regex, value);
            });
        });

        try {
            fs.writeFileSync(outputPath, pageContent, 'utf8');
            successCount++;
        } catch (err) {
            console.error(`❌ Failed to write file ${fileName}: ${err.message}`);
            skipCount++;
        }
    });

    console.log('\n✨ Generation Summary:');
    console.log(`- Total CSV Data Rows: ${dataRows.length}`);
    console.log(`- Successfully Generated: ${successCount} pages`);
    if (skipCount > 0) {
        console.log(`- Skipped/Failed: ${skipCount} rows`);
    }
    console.log(`- Output Folder: ${OUTPUT_DIR}`);

    // Trigger auto-deployment to Cloudflare Pages
    deployToCloudflare();
}

if (require.main === module) {
    main();
}
