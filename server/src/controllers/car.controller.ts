import { Request, Response } from 'express';
import { PrismaClient, CarStatus, DriveType } from '@prisma/client';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

const mapDriveType = (type: string | null): DriveType | null => {
  if (!type) return null;
  const upper = type.toUpperCase();
  if (upper === 'FWD' || upper === 'FRONT_WHEEL') return DriveType.FRONT_WHEEL;
  if (upper === 'RWD' || upper === 'REAR_WHEEL') return DriveType.REAR_WHEEL;
  if (upper === 'AWD' || upper === 'ALL_WHEEL') return DriveType.ALL_WHEEL;
  if (upper === '4WD' || upper === 'FOUR_WHEEL') return DriveType.FOUR_WHEEL;
  return null;
};

export const getCars = async (req: Request, res: Response) => {
  try {
    const {
      make,
      model,
      minPrice,
      maxPrice,
      year,
      condition,
      transmission,
      fuelType,
      bodyType,
      driveType,
      page = 1,
      limit = 10
    } = req.query;

    const pageNum = parseInt(String(page));
    const limitNum = parseInt(String(limit));
    const skip = (pageNum - 1) * limitNum;

    const filters: any = {
      status: 'AVAILABLE',
    };

    if (make) filters.make = { contains: String(make), mode: 'insensitive' };
    if (model) filters.model = { contains: String(model), mode: 'insensitive' };
    if (condition) {
      if (Array.isArray(condition)) {
        filters.OR = (condition as string[]).map(c => ({
          condition: { equals: String(c), mode: 'insensitive' }
        }));
      } else {
        filters.condition = { equals: String(condition), mode: 'insensitive' };
      }
    }
    if (transmission) filters.transmission = { equals: String(transmission), mode: 'insensitive' };
    if (fuelType) filters.fuelType = { equals: String(fuelType), mode: 'insensitive' };
    if (bodyType) filters.bodyType = { equals: String(bodyType), mode: 'insensitive' };
    if (driveType) filters.driveType = String(driveType).toUpperCase();
    
    if (year) {
      filters.year = parseInt(String(year));
    }

    if (minPrice || maxPrice) {
      filters.price = {};
      if (minPrice) filters.price.gte = parseFloat(String(minPrice));
      if (maxPrice) filters.price.lte = parseFloat(String(maxPrice));
    }

    // Get total count for pagination metadata
    const totalCount = await prisma.car.count({ where: filters });

    const cars = await prisma.car.findMany({
      where: filters,
      skip,
      take: limitNum,
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
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Check for saved status if user is logged in
    let savedCarIds: string[] = [];
    const userId = (req as any).user?.userId;

    if (userId) {
      const savedCars = await prisma.savedCar.findMany({
        where: { userId },
        select: { carId: true }
      });
      savedCarIds = savedCars.map(sc => sc.carId);
    }

    const parsedCars = cars.map(car => ({
      ...car,
      images: typeof car.images === 'string' ? JSON.parse(car.images) : car.images,
      features: typeof car.features === 'string' ? JSON.parse(car.features) : car.features,
      isFavorited: savedCarIds.includes(car.id)
    }));

    res.json({
      cars: parsedCars,
      pagination: {
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
        currentPage: pageNum,
        limit: limitNum
      }
    });
  } catch (error) {
    console.error('Error fetching cars:', error);
    res.status(500).json({ error: 'Failed to fetch cars' });
  }
};

export const getCarById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Increment views and get car in one transaction or separate call
    const car = await prisma.car.update({
      where: { id: String(id) },
      data: {
        views: {
          increment: 1
        }
      },
      include: {
        seller: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatar: true,
            email: true,
            phone: true,
            sellerProfile: true
          }
        },
        _count: {
          select: { offers: true }
        }
      }
    });

    if (!car) {
      return res.status(404).json({ error: 'Car not found' });
    }

    // Check for saved status if user is logged in
    let isFavorited = false;
    const userId = (req as any).user?.userId;

    if (userId) {
      const savedCar = await prisma.savedCar.findUnique({
        where: {
          userId_carId: {
            userId,
            carId: String(id)
          }
        }
      });
      isFavorited = !!savedCar;
    }

    const parsedCar = {
      ...car,
      images: typeof car.images === 'string' ? JSON.parse(car.images) : car.images,
      features: typeof car.features === 'string' ? JSON.parse(car.features) : car.features,
      isFavorited
    };

    res.json(parsedCar);
  } catch (error) {
    console.error('Error fetching car details:', error);
    res.status(500).json({ error: 'Failed to fetch car details' });
  }
};

export const createCar = async (req: any, res: Response) => {
  try {
    const { userId } = req.user;
    const body = req.body;

    console.log('Create Request - User:', userId);
    console.log('Create Request - Body:', body);

    const {
      price,
      priceType,
      year,
      make,
      model,
      location,
      mileage,
      fuelType,
      transmission,
      bodyType,
      color,
      condition,
      vin,
      features,
      driveType,
      doors,
      description
    } = body;

    const files = req.files as Express.Multer.File[];
    const images = files ? files.map((file: any) => file.path) : [];

    // Parse features
    let parsedFeatures = [];
    if (typeof features === 'string') {
      try {
        parsedFeatures = JSON.parse(features);
      } catch (e) {
        parsedFeatures = [features];
      }
    } else if (Array.isArray(features)) {
      parsedFeatures = features;
    }

    const title = `${year} ${make} ${model}`;

    // Check VIN uniqueness if provided
    if (vin) {
        const vinExists = await prisma.car.findFirst({
            where: { vin }
        });
        if (vinExists) {
            return res.status(400).json({ error: 'A car with this VIN already exists' });
        }
    }

    const carData = {
      sellerId: userId,
      title,
      description: description || '',
      price: parseFloat(String(price).replace(/,/g, '')),
      priceType: priceType || 'Fixed',
      year: parseInt(String(year)),
      make: make || '',
      model: model || '',
      location: location || '',
      mileage: parseInt(String(mileage)) || 0,
      fuelType: fuelType || '',
      transmission: transmission || '',
      bodyType: bodyType || '',
      color: color || '',
      condition: condition || '',
      vin: vin || null,
 images: JSON.stringify(images),
      features: JSON.stringify(parsedFeatures),
      status: CarStatus.AVAILABLE,
      driveType: mapDriveType(driveType),
      doors: doors ? parseInt(String(doors)) : null
    };
    console.log('Final Create Data for Prisma:', carData);

    const car = await prisma.car.create({
      data: carData
    });

    res.status(201).json({
      ...car,
      images: JSON.parse(car.images),
      features: car.features ? JSON.parse(car.features) : []
    });
  } catch (error) {
    console.error('Error creating car:', error);
    res.status(500).json({ error: 'Failed to create car listing' });
  }
};

export const updateCar = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.user;
    const body = req.body;

    console.log('Update Request - ID:', id, 'User:', userId);
    console.log('Update Request - Body:', body);

    const existingCar = await prisma.car.findUnique({ where: { id } });
    if (!existingCar) {
      return res.status(404).json({ error: 'Car not found' });
    }
    
    if (existingCar.sellerId !== userId) {
      return res.status(403).json({ error: 'Unauthorized to update this listing' });
    }

    const allowedFields = [
      'title', 'description', 'price', 'priceType', 'year', 'make', 'model', 
      'location', 'mileage', 'fuelType', 'transmission', 'bodyType', 'color', 
      'condition', 'vin', 'features', 'driveType', 'doors', 'existingImages'
    ];
    
    const updateData: any = {};
    allowedFields.forEach(field => {
      if (body[field] !== undefined) {
        const value = body[field];
        // Handle numeric fields
        if (['price', 'year', 'mileage', 'doors'].includes(field)) {
          if (value === '' || value === null) {
            updateData[field] = null;
          } else {
            const numValue = field === 'price' ? parseFloat(String(value).replace(/,/g, '')) : parseInt(String(value));
            if (!isNaN(numValue)) {
              updateData[field] = numValue;
            }
          }
        } else if (field === 'features') {
          if (typeof value === 'string') {
            try {
              updateData.features = JSON.stringify(JSON.parse(value));
            } catch (e) {
              updateData.features = JSON.stringify([value]);
            }
          } else if (Array.isArray(value)) {
            updateData.features = JSON.stringify(value);
          }
        } else if (field === 'driveType') {
          updateData.driveType = mapDriveType(value);
        } else if (field === 'vin') {
          updateData.vin = value || null;
        } else if (field !== 'existingImages') {
          updateData[field] = value;
        }
      }
    });

    // Handle images: merge existingImages with new files
    let finalImages = [];
    if (body.existingImages) {
        try {
            finalImages = typeof body.existingImages === 'string' ? JSON.parse(body.existingImages) : body.existingImages;
        } catch (e) {
            finalImages = Array.isArray(body.existingImages) ? body.existingImages : [body.existingImages];
        }
    } else {
        // If existingImages not provided, keep current images
        finalImages = JSON.parse(existingCar.images);
    }

    const files = req.files as Express.Multer.File[];
    if (files && files.length > 0) {
      const newImages = files.map((file: any) => file.path);
      finalImages = [...finalImages, ...newImages];
    }
    
    updateData.images = JSON.stringify(finalImages);

    // Check VIN uniqueness if it's being updated
    if (updateData.vin && updateData.vin !== existingCar.vin) {
        const vinExists = await prisma.car.findFirst({
            where: {
                vin: updateData.vin,
                id: { not: id }
            }
        });
        if (vinExists) {
            return res.status(400).json({ error: 'A car with this VIN already exists' });
        }
    }

    console.log('Final Update Data for Prisma:', updateData);

    if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: 'No valid fields provided for update' });
    }

    const car = await prisma.car.update({
      where: { id },
      data: updateData
    });

    res.json(car);
  } catch (error) {
    console.error('Error updating car:', error);
    res.status(500).json({ error: 'Failed to update car listing' });
  }
};

export const requestDeletion = async (req: any, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.user;

    const car = await prisma.car.findUnique({ where: { id } });
    if (!car || car.sellerId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const updatedCar = await prisma.car.update({
      where: { id },
      data: { status: 'DELETION_PENDING' }
    });

    res.json({ message: 'Deletion request sent to admin', car: updatedCar });
  } catch (error) {
    console.error('Error requesting deletion:', error);
    res.status(500).json({ error: 'Failed to request deletion' });
  }
};
