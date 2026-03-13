import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function setupDatabase() {
  try {
    console.log('🔧 Setting up database schema...');
    
    // Try to execute using Prisma
    const { stdout, stderr } = await execAsync('npx prisma db push --skip-generate --force-skip-generate');
    
    console.log('✅ Database schema created successfully!');
    console.log(stdout);
    
    if (stderr) {
      console.warn('⚠️ Warnings:', stderr);
    }
  } catch (error) {
    console.error('❌ Error setting up database:', error.message);
    process.exit(1);
  }
}

setupDatabase();
