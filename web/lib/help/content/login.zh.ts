// web/lib/help/content/login.zh.ts — 「登录」(section: Account), Simplified Chinese.
// Drafted by the local translation model from login.ts and hand-reviewed.
// `labels` are the exact `auth.*` / `profile.*` values from messages/zh.json.
import type { HelpArticleContent } from '@matthewdbaldwin/microport-ui/help/logic';

const login: HelpArticleContent = {
  slug:  'login',
  title: '登录',
  intro: 'ProductPort 本身没有密码。您通过公司门户（hub.microport.com）登录，ProductPort 信任公司门户返回的结果。',
  lastUpdated: '2026-09-04',
  sections: [
    {
      id: 'how-it-works', heading: '登录流程',
      blocks: [
        { kind: 'steps', steps: [
          '打开 ProductPort。如果您尚未登录，会进入登录页面，页面显示“正在跳转到公司门户…”并自动将您跳转到公司门户。“使用公司门户登录”按钮仅作备用：如果没有自动跳转，请点击该按钮。',
          '在公司门户登录。公司门户确认您的身份后，会将您送回 ProductPort。',
          'ProductPort 会短暂显示“正在完成登录…”，然后打开目录。',
        ], labels: ['正在跳转到公司门户…', '使用公司门户登录', '正在完成登录…'] },
        { kind: 'paragraph', text: '默认情况下，会话持续 8 小时。之后，当您再次加载页面时，ProductPort 会让您重新登录。' },
      ],
    },
    {
      id: 'access', heading: '谁可以登录，以及您可以做什么',
      blocks: [
        { kind: 'paragraph', text: '默认情况下，所有员工都拥有只读访问权限：您可以浏览和搜索目录、打开产品详情并复制产品链接。' },
        { kind: 'paragraph', text: '产品管理员权限（可添加、编辑、导入和导出产品）由管理员在公司门户中授予，而不是在 ProductPort 内授予。您当前的角色显示在个人资料面板中。' },
      ],
    },
    {
      id: 'trouble', heading: '如果登录未能完成',
      blocks: [
        { kind: 'list', items: [
          '页面显示登录未能完成，并提供“返回登录”按钮。点击它重新开始登录。如果持续失败，请联系您的管理员。',
          '页面显示访问被拒绝。请管理员在公司门户中为您授予 ProductPort 访问权限。消息中可能提到 SalesPort，即公司门户的旧名称；两者指的是同一个地方。',
          '登录不断跳转。如果您在约 12 秒内被跳转到公司门户超过两次，ProductPort 会停止跳转并显示“重试”按钮。点击一次即可；如果再次出现同样的情况，请联系您的管理员。',
          'Cookie 被阻止。如果您的浏览器阻止了 Cookie 或网站存储（例如 Safari 开启了“阻止所有 Cookie”，或某些无痕浏览模式），登录将无法完成，页面会提示此问题。请更改设置或退出无痕浏览，然后重试。',
        ], labels: ['返回登录', '重试'] },
      ],
    },
    {
      id: 'profile', heading: '您的个人资料与退出登录',
      blocks: [
        { kind: 'paragraph', text: '顶部栏中的“个人资料”图标会打开一个侧边面板，显示您的姓名、邮箱和角色。这些信息由中心统一管理，此处只读；“管理您的账户”会在新标签页中打开公司门户。', labels: ['个人资料', '管理您的账户'] },
        { kind: 'paragraph', text: '“主题”选择器可更改 ProductPort 的外观。您的选择会保存到您的账户，并在其他 MicroPort 应用中沿用。', labels: ['主题'] },
        { kind: 'paragraph', text: '“退出登录”按钮位于面板底部，是 ProductPort 中唯一的退出登录入口。退出后您会回到登录页面，该页面会立即重新开始登录流程，因此如果您已完成操作，请直接关闭标签页。', labels: ['退出登录'] },
      ],
    },
    {
      id: 'faq', heading: '常见问题',
      blocks: [
        { kind: 'faq', items: [
          { q: '我有单独的 ProductPort 密码吗？', a: '没有。ProductPort 从不要求输入密码；您始终通过公司门户登录。' },
          { q: '为什么我在使用过程中被送回了登录页面？', a: '您的会话已过期。默认情况下，会话持续 8 小时；重新登录即可继续。' },
          { q: '我可以看到目录，但无法添加或编辑产品。为什么？', a: '您拥有的是只读访问权限。请管理员在公司门户中为您授予产品管理员权限。' },
          { q: '为什么访问被拒绝的消息中提到了 SalesPort？', a: 'SalesPort 是公司门户的旧名称。请管理员在公司门户中为您授予访问权限。' },
          { q: '我退出登录后立即被送回了登录页面，这正常吗？', a: '正常。登录页面会自动重新开始登录流程。如果您已完成操作，请直接关闭标签页。' },
        ] },
      ],
    },
  ],
  related: ['catalog-browse'],
};

export default login;
