# 字形包(drawtell/glyphs)

52 个拉丁字母(`a–z` 与 `A–Z`)的**笔顺**数据,加一支把它铺成 freedraw 元素的笔。
给的是"这个字母怎么一笔一笔写出来",不是"这个字母长什么样"——后者字体就能做,
前者字体做不到:字体轮廓的显现方向由字形决定,演示 `a` 时很可能是从左往右淡入,
而不是"先画圈、再落竖"。

## 为什么是 freedraw

播放器已有的 `text` 元素走 `patchSvgText`,是字体轮廓的显现;`freedraw` 走
`patchSvgFreedraw`,是沿 points 逐点插值生长路径 + 笔尖跟随——那才是手写。
于是"演示写字"和"讲解动画"共用同一条渲染链、同一种逐笔动画,没有第二套播放器。

## 坐标系:四线三格

归一化到 x 高 = 1、基线 = 0、y 向上为负:

```
y = -2   top      升部顶 b d f h k l t(t 按惯例略低,-1.7)+ **大写顶**
y = -1   xTop     x 高顶
y =  0   base     基线
y = +1   bottom   降部底 g j p q y
```

大写取 `CAP = ASC = 2`(顶第一线)。Excalifont 实测的 cap height 只有 1.653——
排版惯例里大写本就低于升部;但四线三格的教学惯例是大写顶第一线,孩子照着写才有参照,
而字形包是示范字。代价是与字体混排时大写偏大约 21%。要换成排版惯例,
把 `metrics.ts` 的 `CAP` 改成 `-1.65`,字形按比例自适应,不必逐字重画。

消费方给 `xHeight`(px)与基线左端坐标,其余按比例算。这套刻度与练习纸上的
四线三格严格对应,所以演示画面和孩子手边的格子是同一套参照;也因此,
`LOWERCASE` 的归一化数据可以直接拿去跟孩子的手写笔迹比对,不只是用来画。

## 与 Excalifont 对齐

drawtell 是边画边说的黑板,正文用手写体(Excalifont,`fontFamily 5`),字形包若比它轻一截,
同一块板上就是一个轻一个重。所以字形包按**实测**对齐了两项:

| | Excalifont | 字形包 | 比值 |
|---|---|---|---|
| 笔画粗细 / x 高 | 0.2006 | 0.2002 | 1.00 |
| 墨迹宽度中位数 | — | — | 1.006 |

粗细用 canvas 像素扫描量 `l` 的行游程中位数得出,据此定 `strokeWidth = xHeight / 30`;
字宽逐字比过,把明显局促的 `f j k r x v y w m` 放宽(`j` 原先只有字体的 72%)。

**只对齐粗细与字宽,不跟骨架。** 字形包是示范字,要的是规范、直立、可模仿;
Excalifont 的倾斜与字宽起伏是正文的手写味,照着它写会把字形教歪。
真实书写教材也是这样:正文一种字,示范字另一种,但视觉重量协调。

## 笔顺口径

英美小学 print(分写印刷体)通行写法,不是连笔体(cursive):

- **圈类**(a c d e g o q)逆时针起笔;b p 的碗与它们**同一个圆**(圆心 0.5/-0.5、半径 0.5),
  字母表放一起不能一个圆一个方
- **拱类**(h m n r)先竖后拱;m 是 3 笔(竖 + 拱 + 拱),不用"折返重描"的一笔写法
- **点**(i j)最后落
- **升部**顶到 top 线,**降部**探到 bottom 线,其余坐在基线上
- 大写:先竖后横(E F H L T)、先左后右(A M N V W)、圈类逆时针(C G O Q S);
  `I` 带上下横以与小写 `l` 区分;`Q` 是唯一探出基线的大写

笔顺流派是有分歧的(4 一笔还是两笔、数字 1 带不带起笔钩、英式 vs 美式),
本包只出这一套作为默认。要换流派,改 `letters.ts` 的数值,或在包外自备数据
喂给同一支笔——`glyphSkeletons` 不关心数据是谁给的。

## 不做什么

- **数字、符号**:各有各的消费方与流派,等真有消费方了再收,不在此处硬凑
- **汉字**:不进内置。几千字的量级和授权问题,性质是内容分发而不是内置资源;
  真要做,走按需数据源,不走这个包

## 用

```ts
import { wordSkeletons } from 'drawtell/glyphs';
import { buildAnimatedSvg } from 'drawtell/player';

const strokes = wordSkeletons('ram', { xHeight: 120, x: 80, y: 300 });
const { svg } = await buildAnimatedSvg(strokes);   // 一笔一个元素,数组顺序即笔顺
```

`wordAdvance(word, { xHeight })` 给排版宽度;`LOWERCASE` 给归一化字形数据(比对用);
`GUIDES` 给四线三格线位(画格子用)。空格只让光标前进 `SPACE_ADVANCE`、不落笔,
所以 `'ram man'` 能一次画完,不必调用方自己拆词。其余收录之外的字符抛
`UnknownGlyphError`,不猜。

## 三个坑(已在包内封掉)

1. **freedraw 走 `convertToExcalidrawElements` 是原样透传的**,不像 rectangle/text 走工厂补
   默认值。`groupIds` 等字段缺一个,`animateSvg` 的 `createGroups` 就会在 `NodeList.forEach`
   里抛 `Cannot read properties of undefined`。`FREEDRAW_BASE` 把整套字段给全。
2. **freedraw 的 `strokeWidth` 会被 perfect-freehand 放大**,视觉粗细约是它的 4 倍。
   x 高 100px 配 `strokeWidth: 4` 会粗到糊成一团;默认 `xHeight / 30` 是量出来的,见下节。
3. **`simulatePressure` 必须关。** 开着时 perfect-freehand 拿点间距当书写速度反推压力,
   于是**采样越密笔画越粗**——`sampleStep` 本该只是性能旋钮,却会改变字的视觉。
   关掉并显式给一条恒定 `pressures`,粗细就只由 `strokeWidth` 决定。

## 采样密度

`sampleStep`(缺省 `SAMPLE_STEP` = 0.1)同时决定曲线平滑度和**动画的 DOM 体积**,
而后者是超线性的:`patchSvgFreedraw` 给每个点生成一条完整路径的 animate,体积 ≈ O(点数²)。
0.05 时单个 `g` 的动画 SVG 就有 586KB,一个词上兆——iPad 上会卡。
0.1 视觉几乎无差别、体积降到约四分之一;0.18 起 `w`、`o` 开始出现可见棱角。

## 改了字形怎么验

```
pnpm test                                                     # 几何断言:接缝、升降部、越界、采样
node --experimental-strip-types scripts/glyph-sheet.mjs        # 小写字母表 → snaps/glyphs/
node --experimental-strip-types scripts/glyph-sheet.mjs caps   # 大写字母表 → snaps/glyphs-caps/
node --experimental-strip-types scripts/glyph-sheet.mjs Apple  # 某个词的逐笔演示 → snaps/glyphs-Apple/
```

断言挡得住越界与断笔(尤其"弧的 `a0` 算出来的点和上一段终点对不上"——肉眼看图未必发现,
动画却会在接缝处跳一下),挡不住"不好看";所以改完字形,两样都跑。
