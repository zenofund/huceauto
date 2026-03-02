import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth.middleware';

const prisma = new PrismaClient();

export const toggleSavedCar = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { carId } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!carId) {
      return res.status(400).json({ error: 'Car ID is required' });
    }

    // Check if car exists
    const car = await prisma.car.findUnique({
      where: { id: carId },
    });

    if (!car) {
      return res.status(404).json({ error: 'Car not found' });
    }

    // Check if already saved
    const existingSavedCar = await prisma.savedCar.findUnique({
      where: {
        userId_carId: {
          userId,
          carId,
        },
      },
    });

    if (existingSavedCar) {
      // Unsave
      await prisma.savedCar.delete({
        where: {
          id: existingSavedCar.id,
        },
      });
      return res.json({ message: 'Car removed from saved list', saved: false });
    } else {
      // Save
      await prisma.savedCar.create({
        data: {
          userId,
          carId,
        },
      });
      return res.status(201).json({ message: 'Car added to saved list', saved: true });
    }
  } catch (error) {
    console.error('Error toggling saved car:', error);
    res.status(500).json({ error: 'Failed to update saved car list' });
  }
};

export const getSavedCars = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { page = 1, limit = 10 } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const pageNum = parseInt(String(page));
    const limitNum = parseInt(String(limit));
    const skip = (pageNum - 1) * limitNum;

    const [savedCars, totalCount] = await Promise.all([
      prisma.savedCar.findMany({
        where: { userId },
        include: {
          car: {
            include: {
              seller: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                  sellerProfile: {
                    select: {
                      companyName: true,
                      verified: true
                    }
                  }
                }
              }
            }
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limitNum,
      }),
      prisma.savedCar.count({ where: { userId } }),
    ]);

    const formattedCars = savedCars.map((sc) => {
      const car = sc.car;
      return {
        ...car,
        images: typeof car.images === 'string' ? JSON.parse(car.images) : car.images,
        features: typeof car.features === 'string' ? JSON.parse(car.features) : car.features,
        isFavorited: true, // Since we're fetching from saved list
      };
    });

    res.json({
      cars: formattedCars,
      pagination: {
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
        currentPage: pageNum,
        limit: limitNum,
      },
    });
  } catch (error) {
    console.error('Error fetching saved cars:', error);
    res.status(500).json({ error: 'Failed to fetch saved cars' });
  }
};

export const checkIsSaved = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;
    const carId = req.params.carId as string;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const savedCar = await prisma.savedCar.findUnique({
      where: {
        userId_carId: {
          userId,
          carId,
        },
      },
    });

    res.json({ isSaved: !!savedCar });
  } catch (error) {
    console.error('Error checking if car is saved:', error);
    res.status(500).json({ error: 'Failed to check saved status' });
  }
};
