
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createInspector() {
  try {
    const hashedPassword = await bcrypt.hash('inspector123', 10);
    const email = 'inspector@example.com';

    const inspector = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        password: hashedPassword,
        firstName: 'Default',
        lastName: 'Inspector',
        role: 'INSPECTOR',
        verified: true,
        inspectorProfile: {
          create: {
            licenseNo: 'INS-001',
            location: 'Lagos, Nigeria',
            verified: true
          }
        },
        wallet: {
          create: {
            balance: 0
          }
        }
      },
    });

    console.log('Inspector created successfully:');
    console.log('Email:', email);
    console.log('Password:', 'inspector123');
    console.log('Role:', inspector.role);

  } catch (error) {
    console.error('Error creating inspector:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createInspector();
