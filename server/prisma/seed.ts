import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding ...');

  const adminHashedPassword = await bcrypt.hash('Huce2026@@##', 10);
  const commonHashedPassword = await bcrypt.hash('password123', 10);

  // Create Admin
  const admin = await prisma.user.upsert({
    where: { email: 'superhero@huceautos.com' },
    update: {
      password: adminHashedPassword,
      role: 'ADMIN',
    },
    create: {
      email: 'superhero@huceautos.com',
      password: adminHashedPassword,
      firstName: 'Super',
      lastName: 'Hero',
      role: 'ADMIN',
      verified: true,
    },
  });

  console.log(`Created admin with id: ${admin.id}`);

  // Create Seller
  const seller = await prisma.user.upsert({
    where: { email: 'seller@example.com' },
    update: {},
    create: {
      email: 'seller@example.com',
      password: commonHashedPassword,
      firstName: 'John',
      lastName: 'Doe',
      role: 'SELLER',
      verified: true,
      sellerProfile: {
        create: {
          type: 'INDIVIDUAL',
          address: '123 Lagos Way',
          verified: true
        }
      }
    },
  });

  console.log(`Created seller with id: ${seller.id}`);

  // Create Cars
  const carsData = [
    {
      title: 'Toyota Camry 2020',
      description: 'Clean foreign used Toyota Camry 2020. Full option with reverse camera and leather seats.',
      price: 15000000,
      year: 2020,
      make: 'Toyota',
      model: 'Camry',
      mileage: 25000,
      fuelType: 'Petrol',
      transmission: 'Automatic',
      bodyType: 'Sedan',
      color: 'Silver',
      condition: 'Foreign Used',
      // status will be set in create
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=400&h=250&fit=crop',
        'https://images.unsplash.com/photo-1590362891991-f776e747a588?w=400&h=250&fit=crop'
      ]),
      features: JSON.stringify(['Leather Seats', 'Reverse Camera', 'Bluetooth', 'Alloy Wheels'])
    },
    {
      title: 'Mercedes-Benz C300 2018',
      description: 'Tokunbo Mercedes Benz C300 4Matic. Accident free, buy and drive.',
      price: 22000000,
      year: 2018,
      make: 'Mercedes-Benz',
      model: 'C300',
      mileage: 40000,
      fuelType: 'Petrol',
      transmission: 'Automatic',
      bodyType: 'Sedan',
      color: 'Black',
      condition: 'Foreign Used',
      // status will be set in create
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1617788138017-80ad40651399?w=400&h=250&fit=crop'
      ]),
      features: JSON.stringify(['Panoramic Roof', 'AMG Kit', 'Keyless Entry'])
    },
    {
      title: 'Lexus RX 350 2016',
      description: 'Lexus RX 350 Full Option. Navigation, thumbstart, power boot.',
      price: 18500000,
      year: 2016,
      make: 'Lexus',
      model: 'RX 350',
      mileage: 55000,
      fuelType: 'Petrol',
      transmission: 'Automatic',
      bodyType: 'SUV',
      color: 'White',
      condition: 'Nigerian Used',
      // status will be set in create
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=400&h=250&fit=crop'
      ]),
      features: JSON.stringify(['Power Boot', 'Navigation', 'Thumbstart'])
    },
    {
      title: 'Honda Accord 2019',
      description: 'Sport trim Honda Accord. Very clean engine and gear.',
      price: 13000000,
      year: 2019,
      make: 'Honda',
      model: 'Accord',
      mileage: 30000,
      fuelType: 'Petrol',
      transmission: 'Automatic',
      bodyType: 'Sedan',
      color: 'Blue',
      condition: 'Foreign Used',
      // status will be set in create
      images: JSON.stringify([
        'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=400&h=250&fit=crop'
      ]),
      features: JSON.stringify(['Sport Mode', 'Lane Assist', 'CarPlay'])
    }
  ];

  for (const car of carsData) {
    // Check if car already exists by title to avoid duplicates on re-seed
    const existingCar = await prisma.car.findFirst({
      where: { title: car.title, sellerId: seller.id }
    });

    if (!existingCar) {
      const createdCar = await prisma.car.create({
        data: {
          ...car,
          sellerId: seller.id,
          status: 'AVAILABLE'
        }
      });
      console.log(`Created car: ${createdCar.title}`);
    } else {
      console.log(`Car already exists: ${car.title}`);
    }
  }

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
