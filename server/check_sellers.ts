
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSellers() {
  try {
    console.log('Checking for users with SELLER role...');
    const sellers = await prisma.user.findMany({
      where: {
        role: 'SELLER',
      },
      include: {
        sellerProfile: true,
      },
    });

    console.log(`Found ${sellers.length} sellers.`);
    if (sellers.length > 0) {
      console.log('Sample seller:', JSON.stringify(sellers[0], null, 2));
    }

    console.log('\nChecking all users to see roles...');
    const allUsers = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
      },
    });
    console.log('All users:', JSON.stringify(allUsers, null, 2));

  } catch (error) {
    console.error('Error checking sellers:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSellers();
