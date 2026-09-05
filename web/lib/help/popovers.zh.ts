// web/lib/help/popovers.zh.ts
// Simplified Chinese sibling of popovers.ts — a self-contained record (no
// import from ./popovers, so there is no circular import with the file that
// imports this one). Drafted via the local 3090 tier (ask-local --translate
// zh) and reviewed by hand. On-screen names (Add image, Set primary, Delete,
// Cancel, Save changes, Certificate number(s), Notes) stay in English because
// the editor itself is hardcoded English in every locale.
import type { HelpContent } from '@matthewdbaldwin/microport-ui/help';

export const POPOVERS: Record<'gallery' | 'clearance', HelpContent> = {
  gallery: {
    summary: '管理此产品的图库：添加图片、设为主图或删除图片。',
    bullets: [
      'Add image 接受 JPEG、PNG 或 WebP，每张不超过 6 MB；第一张图片会成为主图。',
      'Set primary 决定目录卡片上显示哪张图片。',
      'Delete 会先要求您确认，然后才移除图片。',
      '每次图片更改都会立即保存，Cancel 无法撤销。',
    ],
  },
  clearance: {
    summary: '每个地区一行。Status、Certificate number(s)、Qualifier 和 Notes 在各行之间相互独立。',
    bullets: [
      'Certificate number(s) 是已获准入（Clearance）的注册（Registration）凭证；多个编号请用竖线分隔（CE-100|CE-200）。',
      '准入信息的更改与表单的其余部分一起通过 Save changes 保存。',
      'CSV 导入会清除每个地区的 Notes；证书编号和 Qualifier 会保留。',
    ],
  },
};

export const POPOVER_TITLES: Record<'gallery' | 'clearance', string> = {
  gallery:   '管理产品图片',
  clearance: '编辑准入矩阵',
};
