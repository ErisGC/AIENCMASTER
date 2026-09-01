import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnnouncementsService } from './announcements.service';
import { Announcement } from './announcement.entity';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

describe('AnnouncementsService', () => {
  let service: AnnouncementsService;

  const repoMock = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    manager: { transaction: jest.fn() },
  };
  const cloudinaryMock = { upload: jest.fn(), delete: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnnouncementsService,
        {
          provide: getRepositoryToken(Announcement),
          useValue: repoMock,
        },
        {
          provide: CloudinaryService,
          useValue: cloudinaryMock,
        },
      ],
    }).compile();

    service = module.get<AnnouncementsService>(AnnouncementsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  /**
   * Regresión: los adjuntos se borraban sin pasar el tipo con el que
   * Cloudinary los guardó. Como los videos se archivan como `video` y borrar
   * con el tipo equivocado no falla (simplemente no borra), cada anuncio con
   * video eliminado dejaba el archivo huérfano consumiendo cuota.
   */
  it('borra cada adjunto con el tipo con el que se guardó', async () => {
    repoMock.findOne.mockResolvedValue({
      id: 'a1',
      attachments: [
        { publicId: 'anuncios/video1', resourceType: 'video' },
        { publicId: 'anuncios/foto1', resourceType: 'image' },
        { publicId: 'anuncios/doc1', resourceType: 'raw' },
      ],
    });
    repoMock.remove.mockResolvedValue(undefined);

    await service.remove('a1');

    expect(cloudinaryMock.delete).toHaveBeenCalledWith(
      'anuncios/video1',
      'video',
    );
    expect(cloudinaryMock.delete).toHaveBeenCalledWith(
      'anuncios/foto1',
      'image',
    );
    expect(cloudinaryMock.delete).toHaveBeenCalledWith('anuncios/doc1', 'raw');
  });
});
