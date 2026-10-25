import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const functionDir = path.join(rootDir, 'functions', 'campusvoice-api');
const distIndex = path.join(functionDir, 'dist', 'index.js');
const outputDir = path.join(rootDir, 'dist');
const tarballPath = path.join(outputDir, 'campusvoice-api.tar.gz');

console.log('📦 Starting packaging of Appwrite Cloud Function: campusvoice-api...');

// 1. Compile TypeScript
console.log('🔨 Compiling TypeScript in functions/campusvoice-api...');
execSync('npm run build:local', { cwd: functionDir, stdio: 'inherit' });

if (!existsSync(distIndex)) {
  console.error('❌ Error: Compilation failed, dist/index.js not found!');
  process.exit(1);
}

// 2. Ensure output directory
if (!existsSync(outputDir)) {
  mkdirSync(outputDir, { recursive: true });
}

// 3. Create .tar.gz bundle
console.log('📦 Creating archive campusvoice-api.tar.gz...');
// On Windows/Linux/macOS modern systems, tar -czf works directly
const tarCmd = `tar -czf "${tarballPath}" -C "${functionDir}" dist package.json package-lock.json`;
execSync(tarCmd, { stdio: 'inherit' });

if (existsSync(tarballPath)) {
  const stats = statSync(tarballPath);
  const sizeKb = (stats.size / 1024).toFixed(2);
  console.log(`✅ Function package created successfully: ${tarballPath} (${sizeKb} KB)`);
  console.log('\n🚀 Deployment Instructions for Appwrite Cloud:');
  console.log('1. Go to Appwrite Cloud Console -> Functions -> campusvoice-api');
  console.log('2. Under Deployments -> Create Deployment (Manual Upload)');
  console.log(`3. Upload file: ${tarballPath}`);
  console.log('4. Set Entrypoint: dist/index.js');
  console.log('5. Activate deployment after build completes.');
} else {
  console.error('❌ Failed to produce tarball archive.');
  process.exit(1);
}
