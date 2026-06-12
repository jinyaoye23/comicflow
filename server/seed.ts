import { PrismaClient } from '@prisma/client';
import { v4 as uuid } from 'uuid';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Dev user
  const user = await prisma.user.upsert({
    where: { email: 'dev@comicflow.local' },
    update: {},
    create: {
      id: uuid(),
      email: 'dev@comicflow.local',
      name: 'Dev User',
      passwordHash: '',
      tier: 'FREE',
      credits: 10,
    },
  });

  console.log(`  ✓ Dev user: ${user.email} (${user.id})`);

  // Sample project
  const project = await prisma.project.create({
    data: {
      id: uuid(),
      userId: user.id,
      title: '示例：赛博咖啡馆',
      genre: '日常科幻',
      style: '赛博朋克',
      status: 'DRAFT',
      script: JSON.stringify({
        title: '赛博咖啡馆',
        genre: '日常科幻',
        style: '赛博朋克',
        characters: [
          {
            name: '阿零',
            role: '主角',
            appearance: '年轻女性，短发，戴AR眼镜，黑色皮夹克，20岁，咖啡师',
            personality: '冷静、寡言、但内心温柔',
          },
          {
            name: '老陈',
            role: '配角',
            appearance: '中年男性，花白胡须，穿中式长衫，50岁，咖啡馆老板',
            personality: '健谈、怀旧、爱讲过去的故事',
          },
        ],
        panels: [
          { index: 0, scene: '霓虹灯闪烁的街道，雨夜', action: '阿零站在咖啡馆门口', dialogue: '"又是雨夜..."', camera: '远景' },
          { index: 1, scene: '咖啡馆内部，暖色灯光', action: '老陈正在擦拭咖啡机', dialogue: '"来啦？今天有新豆子"', camera: '中景' },
          { index: 2, scene: '阿零调试AR眼镜', action: '眼镜上显示咖啡数据', dialogue: '"埃塞俄比亚，日晒..."', camera: '特写' },
          { index: 3, scene: '窗外霓虹与室内暖光的对比', action: '两人对坐品咖啡', dialogue: '"这味道，让我想起2042年"', camera: '全景' },
        ],
      }),
      characters: {
        create: [
          {
            id: uuid(),
            name: '阿零',
            description: '年轻女性，短发，戴AR眼镜，黑色皮夹克，20岁，咖啡师。冷静、寡言、但内心温柔。',
          },
          {
            id: uuid(),
            name: '老陈',
            description: '中年男性，花白胡须，穿中式长衫，50岁，咖啡馆老板。健谈、怀旧、爱讲过去的故事。',
          },
        ],
      },
      panels: {
        create: [
          { id: uuid(), index: 0, scene: '霓虹灯闪烁的街道，雨夜', action: '阿零站在咖啡馆门口', dialogue: '"又是雨夜..."', camera: '远景' },
          { id: uuid(), index: 1, scene: '咖啡馆内部，暖色灯光', action: '老陈正在擦拭咖啡机', dialogue: '"来啦？今天有新豆子"', camera: '中景' },
          { id: uuid(), index: 2, scene: '阿零调试AR眼镜', action: '眼镜上显示咖啡数据', dialogue: '"埃塞俄比亚，日晒..."', camera: '特写' },
          { id: uuid(), index: 3, scene: '窗外霓虹与室内暖光的对比', action: '两人对坐品咖啡', dialogue: '"这味道，让我想起2042年"', camera: '全景' },
        ],
      },
    },
  });

  console.log(`  ✓ Sample project: ${project.title} (${project.id})`);
  console.log('✅ Seed complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
