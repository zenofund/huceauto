import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const recordView = async (req: Request, res: Response) => {
  try {
    const { carId } = req.body;
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Upsert to update viewedAt if already exists
    await prisma.viewedCar.upsert({
      where: {
        userId_carId: {
          userId,
          carId,
        },
      },
      update: {
        viewedAt: new Date(),
      },
      create: {
        userId,
        carId,
      },
    });

    res.status(200).json({ message: 'View recorded' });
  } catch (error) {
    console.error('Error recording view:', error);
    res.status(500).json({ error: 'Failed to record view' });
  }
};

export const getViewHistory = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const total = await prisma.viewedCar.count({
      where: { userId },
    });

    const views = await prisma.viewedCar.findMany({
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
        viewedAt: 'desc',
      },
      skip,
      take: limit,
    });

    // Check for saved status for each car
    const savedCars = await prisma.savedCar.findMany({
      where: { userId },
      select: { carId: true }
    });
    const savedCarIds = savedCars.map(sc => sc.carId);

    const formattedHistory = views.map((view) => ({
      ...view.car,
      images: typeof view.car.images === 'string' ? JSON.parse(view.car.images) : view.car.images,
      features: typeof view.car.features === 'string' ? JSON.parse(view.car.features) : view.car.features,
      viewedAt: view.viewedAt,
      isFavorited: savedCarIds.includes(view.car.id)
    }));

    res.json({
      history: formattedHistory,
      pagination: {
        total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    console.error('Error fetching view history:', error);
    res.status(500).json({ error: 'Failed to fetch view history' });
  }
};

export const clearHistory = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    await prisma.viewedCar.deleteMany({
      where: { userId },
    });

    res.status(200).json({ message: 'History cleared successfully' });
  } catch (error) {
    console.error('Error clearing view history:', error);
    res.status(500).json({ error: 'Failed to clear view history' });
  }
};

export const deleteHistoryItem = async (req: Request, res: Response) => {
  try {
    const carId = req.params.carId as string;
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    await prisma.viewedCar.delete({
      where: {
        userId_carId: {
          userId,
          carId,
        },
      },
    });

    res.status(200).json({ message: 'History item removed' });
  } catch (error) {
    console.error('Error deleting history item:', error);
    res.status(500).json({ error: 'Failed to remove history item' });
  }
};
