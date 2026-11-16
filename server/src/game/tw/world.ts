/**
 * Tam Quốc Toàn Chiến (Total War: Three Kingdoms) — Máy Chủ Trọng Tài Chiến Trường Đại Quân (`TwWorld`).
 *
 * Điều phối mô phỏng thời gian thực ở nhịp `15 Hz` (`67ms`/nhịp):
 * 1. Triển khai Đại Quân Chư Hầu (3 Danh Tướng Ngũ Hành + 12 Trung Đoàn Bộ Tùy cho 2–4 phe, hoặc 9 Bộ Tùy khi 5–8 phe)
 *    theo thế trận 2 tuyến chuẩn Total War: Bộ binh Trường Thương giữ sườn & Đao Thuẫn trung lộ ở Tuyến Đầu,
 *    Cung Nỏ & Pháo Đá Uy Viễn ở Tuyến Hai, Kỵ Binh Xung Kích chia đều Hai Cánh, Danh Tướng trấn giữ ngay sau Bộ Tùy.
 * 2. Xử lý 8 loại lệnh điều binh (`move_line`, `attack_target`, `halt`, `set_formation`, `toggle_stance`,
 *    `use_skill`, `challenge_duel`, `resign`) có bộ lọc chống spam token (`TW_CMD_BURST` / `TW_CMD_REFILL`).
 * 3. Chu trình Vật lý – Chiến thuật 15 Hz: AI Chư Hầu (`stepTwBotSide`) -> Địa hình & Điều hướng đội hình
 *    (`sampleTerrainAt`, `stepRegimentMovement`) -> Đơn Đấu Diễn Nghĩa (`stepGeneralDuels`) -> Xung kích & Phản xung kích
 *    Thương Lâm (`stepMeleeAndCharges`) -> Đạn đạo Cung Nỏ / Pháo Đá (`stepRangedAndProjectiles`) -> Hào quang Ngũ Hành
 *    & Sĩ khí (`stepMoraleAndAuras`) -> Ẩn quân Rừng Thông (`isRegimentHidden`) -> Chiếm Đài Hiệu Lệnh (`stepCapturePoints`).
 * 4. Đối thoại Danh Tướng điện ảnh (`TwBanterEvent`) khai chiến tại `tick = 5` và tự động phát khi Xung kích lớn,
 *    Đơn Đấu, Phục binh rừng thông lộ diện hoặc Đại quân vỡ trận (giới hạn tối đa 1 thoại mỗi 18 giây).
 * 5. Lọc Sương Mù / Phục Binh theo góc nhìn từng người chơi (`frameFor(viewerIdx)`), tính Cán Cân Quân Lực
 *    (`balanceOfPower`) và phân xử Chiến Thắng (`'heroic' | 'decisive' | 'close' | 'pyrrhic'`).
 */

import {
  TW_BATTLE_SPEEDS,
  TW_CLASSES,
  TW_CMD_BURST,
  TW_CMD_REFILL,
  TW_DEPLOYABLES,
  TW_FACTIONS,
  TW_FORMATION_IDS,
  TW_GENERALS,
  TW_GENERALS_PER_PLAYER,
  TW_MAPS,
  TW_RETINUE_PER_GENERAL,
  TW_TEAM_NAMES,
  TW_TICK_HZ,
  TW_TICK_MS,
  TW_UNITS,
  normalizeTwLoadout,
  twPointInTerrainZone,
  twRankFromKills,
  twScaledMaxMen,
  type TwArmyLoadout,
  type TwBanterEvent,
  type TwBattlePhase,
  type TwBattleSpeed,
  type TwCaptureState,
  type TwCommand,
  type TwConfig,
  type TwDeployZoneSpec,
  type TwDeployableFrame,
  type TwDeployableKind,
  type TwDuelFrame,
  type TwFactionId,
  type TwFireZoneFrame,
  type TwFormation,
  type TwFrame,
  type TwGeneralClass,
  type TwGeneralId,
  type TwMapSpec,
  type TwPlayerInfo,
  type TwProjectileFrame,
  type TwRegimentFrame,
  type TwResult,
  type TwSfxEvent,
  type TwSideSummary,
  type TwUnitKind,
} from '../../../../shared/src/tw';
import { stepTwBotSide } from './bot';
import {
  spawnBastionTowerProjectile,
  stepFieldFortificationsAndFires,
  stepMeleeAndCharges,
  stepMoraleAndAuras,
  stepRangedAndProjectiles,
  toProjectileFrame,
  triggerGuanxiOnGeneralDeath,
  tryIgniteWildfireAt,
  type TwLiveDeployable,
  type TwLiveFireZone,
  type TwLiveProjectile,
} from './combat';
import {
  applyDuelAction,
  castGeneralSkill,
  hasPendingDuelChallenge,
  stepGeneralDuels,
  toDuelFrame,
  tryStartGeneralDuel,
  type TwActiveDuel,
} from './duel';
import {
  computeMultiRegimentLineTargets,
  normalizeAngle,
  recomputeRegimentDimensions,
  stepRegimentMovement,
  type TwSimRegiment,
  type TwSteeringHazard,
} from './formations';
import {
  TW_FOREST_SPOT_RADIUS,
  clampToBattlefield,
  computeDeployZoneForPose,
  computeSpawnPositions,
  createInitialCaptureStates,
  getTwMapSpec,
  isRegimentHidden,
  isValidDeploymentPosition,
  sampleTerrainAt,
  stepBastionWatchtowers,
  stepCapturePoints,
  suppressBastionTowerAt,
  type TwSpawnPose,
} from './terrain';

// ============================================================================
// HẰNG SỐ ĐIỀU PHỐI THẾ GIỚI & ĐIỀU KIỆN CHIẾN THẮNG
// ============================================================================

const DT_SEC = 1 / TW_TICK_HZ;

/** Nhịp khai mở đối thoại Danh Tướng đầu trận */
const OPENING_BANTER_TICK = 5;
/** Thời gian hiển thị mỗi đối thoại Danh Tướng trên khung hình (~7.5s ở 15 Hz) */
const BANTER_DISPLAY_TICKS = Math.round(7.5 * TW_TICK_HZ);
/** Khoảng nghỉ tối thiểu giữa hai lần phát đối thoại Danh Tướng động (18 giây = 270 nhịp) */
const BANTER_COOLDOWN_TICKS = 18 * TW_TICK_HZ;

/** Số Đài Hiệu Lệnh tối thiểu cần nắm giữ đồng thời ở mức 100% để kích hoạt đếm ngược Bá Nghiệp */
const CAPTURE_VICTORY_MIN_POINTS = 2;
/** Thời gian giữ vững >= 2/3 Đài Hiệu Lệnh liên tục để giành chiến thắng chiến lược (45 giây = 675 nhịp) */
const CAPTURE_VICTORY_HOLD_SEC = 45;
const CAPTURE_VICTORY_HOLD_TICKS = CAPTURE_VICTORY_HOLD_SEC * TW_TICK_HZ;
const CAPTURE_VICTORY_WARN_TICKS = 25 * TW_TICK_HZ;

/** Khoảng cách bố trí các tuyến trong thế trận Khai Chiến 2 hàng chuẩn Total War */
const DEPLOY_FRONT_GAP = 14;
const DEPLOY_WING_GAP = 26;
const DEPLOY_SECOND_RANK_OFFSET = 112;
const DEPLOY_TREBUCHET_EXTRA_OFFSET = 36;
const DEPLOY_GENERAL_RANK_OFFSET = 176;

// ============================================================================
// KIỂU DỮ LIỆU CHƯ HẦU & HOOKS VÒNG ĐỜI
// ============================================================================

export interface TwSeatInit {
  id: string;
  name: string;
  faction: TwFactionId;
  color: string;
  team: number;
  bot: boolean;
  loadout?: TwArmyLoadout;
}

export interface TwWorldHooks {
  /** Gọi mỗi nhịp 15 Hz để phát khung hình tới người chơi & khán giả */
  tick(): void;
  /** Gọi khi có nhật ký chiến sự mới, có chư hầu bại vong hoặc ván đấu kết thúc */
  changed?(): void;
}

export type TwWorldTickCallback = (() => void) | TwWorldHooks;

export interface TwSide {
  idx: number;
  id: string;
  name: string;
  faction: TwFactionId;
  color: string;
  team: number;
  bot: boolean;
  alive: boolean;
  resigned: boolean;
  readyDeploy: boolean;
  deployablesLeft: Record<TwDeployableKind, number>;
  generals: [TwGeneralId, TwGeneralId, TwGeneralId];
  initialMen: number;
  totalMen: number;
  regimentsAlive: number;
  kills: number;
  score: number;
  /** Ngân sách chống spam lệnh điều binh */
  tokens: number;
}

// ============================================================================
// BỘ LỜI THOẠI DANH TƯỚNG TAM QUỐC (HISTORICAL & ROMANCE BANTER)
// ============================================================================

const GENERAL_OPENING_TAUNTS: Record<TwGeneralId, string> = {
  sima_xiangan:
    'Thiết Kỵ Đại Tấn đã dàn trận chỉnh tề! Kẻ nào dám cản đường vương sư họ Tư Mã tất phải tan xác nơi sa trường!',
  yuan_shao:
    'Ta xuất thân Tứ Thế Tam Công, thống lĩnh đại quân Hà Bắc đông tựa mây ngàn! Hôm nay ắt quét sạch lũ phản nghịch!',
  cao_cao:
    'Thà ta phụ người thiên hạ chứ chẳng để thiên hạ phụ ta! Ba quân nghe hiệu lệnh Ngụy Võ, đoạt lấy trung nguyên!',
  xiahou_dun:
    'Độc Nhãn Hạ Hầu Nguyên Nhượng đứng mũi chịu sào đây! Tên tiểu tốt nào dám bước lên thử lưỡi đao của ta?!',
  liu_bei:
    'Ta mang dòng máu Hán Thất, vì bách tính lầm than mà dấy nghĩa binh! Nguyện cùng chư đệ khôi phục giang sơn!',
  guan_yu:
    'Thanh Long Yển Nguyệt Đao trong tay Quan mỗ đã khát máu giặc! Kẻ thức thời mau xuống ngựa quy hàng!',
  zhang_fei:
    'Yên Nhân Trương Dực Đức ở đây! Ai dám cùng ta quyết một trận tử chiến ba trăm hiệp không?!',
  zhao_yun:
    'Thường Sơn Triệu Tử Long vâng mệnh chúa công! Dẫu trước mặt là muôn trùng vây cũng quyết phá trận mở đường!',
  zhuge_liang:
    'Thiên thời, địa lợi, nhân hòa đều nằm trong bàn tay Khổng Minh. Trận đồ Bát Quái hôm nay chính là mồ chôn quân địch!',
  sun_jian:
    'Mãnh Hổ Giang Đông xuất chiến! Gươm Cổ Đĩnh vung lên, kẻ thù phương Bắc chớ hòng giữ nổi mảnh giáp!',
  zhou_yu:
    'Gió Đông đã nổi, cung tên rực lửa! Đại Đô Đốc Giang Đông sẽ biến doanh trại các ngươi thành biển lửa đỏ trời!',
  lu_bu:
    'Nhân trung Lữ Bố, mã trung Xích Thố! Khắp thiên hạ này có kẻ nào đỡ nổi một kích Phương Thiên của bản hầu?!',
};

const GENERAL_OPENING_REPLIES: Record<TwGeneralId, string> = {
  sima_xiangan:
    'Khẩu khí ngông cuồng! Hãy xem trọng giáp thiết kỵ của bản tướng giẫm nát đại kỳ các ngươi trong chớp mắt!',
  yuan_shao:
    'Láo xược! Cung nỏ Hà Bắc giương sẵn muôn tên, thề bắn nát xác bọn cuồng đồ dưới chân đài hiệu lệnh!',
  cao_cao:
    'Binh quý thần tốc, không quý lời suông! Đợi khi trống trận vang rền sẽ biết ai mới là bậc anh hùng thiên hạ!',
  xiahou_dun:
    'Ha ha! Khua môi múa mép vô ích, cứ thúc ngựa xông lên để thương đao định đoạt thắng bại!',
  liu_bei:
    'Chính nghĩa ở tại lòng người! Nghĩa quân Hán Thất quyết đồng tâm hiệp lực bẻ gãy mũi nhọn xâm lăng!',
  guan_yu:
    'Trong mắt Quan Vân Trường, binh hùng tướng mạnh bên kia cũng chỉ như cỏ rác chờ lưỡi đao phán xét!',
  zhang_fei:
    'Bớt nhiều lời đi! Để Bát Xà Mâu của Trương gia chọc thủng bụng ngươi xem còn dám khoác lác nữa chăng!',
  zhao_yun:
    'Long Đảm Thương đã sáng ngời sương tuyết! Mời chư vị tiến lên lĩnh giáo thương pháp Thường Sơn!',
  zhuge_liang:
    'Kẻ hữu dũng vô mưu chỉ tự chui đầu vào rọ. Hãy mở to mắt xem kỳ binh của ta xoay chuyển càn khôn!',
  sun_jian:
    'Hảo hán Giang Đông chưa từng biết lùi bước! Ba quân nghe lệnh, nổi trống tiến công!',
  zhou_yu:
    'Khúc nhạc chiến trường hôm nay do Chu Công Cẩn tấu lên — e rằng quân các ngươi có đến mà chẳng có về!',
  lu_bu:
    'Một lũ kiến hôi tụ bầy! Tất cả cứ xông lên một lượt cho Lữ Phụng Tiên đỡ tốn công chém từng tên!',
};

function getOpeningBanterLines(
  leftGen: TwGeneralId,
  rightGen: TwGeneralId,
): { leftLine: string; rightLine: string } {
  // Cặp kinh điển chuẩn ảnh mẫu Bình Nguyên: Tư Mã Tương An vs Viên Thiệu
  if (leftGen === 'sima_xiangan' && rightGen === 'yuan_shao') {
    return {
      leftLine:
        'You fight like a dairy farmer! — Viên Bản Sơ! Ngươi cầm quân đánh trận chẳng khác nào gã chăn bò trước Thiết Kỵ Đại Tấn!',
      rightLine:
        'How appropriate! You fight like a cow! — Khéo lắm họ Tư Mã! Đại quân Hà Bắc xem ngươi đánh hệt như một con bò!',
    };
  }
  if (leftGen === 'yuan_shao' && rightGen === 'sima_xiangan') {
    return {
      leftLine:
        'How appropriate! You fight like a cow! — Tư Mã tiểu tử! Đại quân Hà Bắc của Viên Bản Sơ xem ngươi đánh hệt như một con bò!',
      rightLine:
        'You fight like a dairy farmer! — Thiết Kỵ Đại Tấn nhìn đám quân ô hợp của ngươi chẳng khác nào gã chăn bò!',
    };
  }
  // Cặp Quan Độ: Tào Tháo vs Viên Thiệu
  if (leftGen === 'cao_cao' && rightGen === 'yuan_shao') {
    return {
      leftLine:
        'Bản Sơ huynh! Quân Hà Bắc tuy đông nhưng lòng dạ bất nhất, hôm nay Mạnh Đức xin mượn đầu cờ của huynh định phương Bắc!',
      rightLine:
        'Tào A Man vô ơn bội nghĩa! Bốn châu tinh binh nghe lệnh, san phẳng doanh trại quân Ngụy cho ta!',
    };
  }
  if (leftGen === 'yuan_shao' && rightGen === 'cao_cao') {
    return {
      leftLine:
        'Tào A Man! Đại quân Hà Bắc áp cảnh như núi Thái Sơn đè trứng, ngươi còn không mau bó tay chịu trói?!',
      rightLine:
        'Bản Sơ đa mưu mà vô đoán! Tinh binh Tào Ngụy lấy một địch mười, quyết phá tan vạn quân của huynh ngay hôm nay!',
    };
  }
  // Cặp Anh Hùng Luận Tửu: Tào Tháo vs Lưu Bị
  if (leftGen === 'cao_cao' && rightGen === 'liu_bei') {
    return {
      leftLine:
        'Huyền Đức công! Năm xưa uống rượu luận anh hùng, nay gặp lại giữa ba quân thật khiến Mạnh Đức bồi hồi!',
      rightLine:
        'Tào Thừa Tướng tuy nắm thiên thời, song Lưu Bị vì đại nghĩa Hán Thất quyết không lùi nhường nửa tấc đất!',
    };
  }
  if (leftGen === 'liu_bei' && rightGen === 'cao_cao') {
    return {
      leftLine:
        'Tào Mạnh Đức hiếp thiên tử lệnh chư hầu! Hôm nay Lưu Bị xin thay mặt Hán Thất thảo phạt gian hùng!',
      rightLine:
        'Huyền Đức vẫn cố chấp như xưa! Thiên mệnh đã đổi, hãy để gươm giáo trên chiến trường phân định chân chúa!',
    };
  }
  // Cặp Xích Bích: Chu Du / Gia Cát Lượng vs Tào Tháo
  if ((leftGen === 'zhou_yu' || leftGen === 'zhuge_liang') && rightGen === 'cao_cao') {
    return {
      leftLine:
        'Tào Mạnh Đức xua quân phương Bắc xa xôi mỏi mệt, hôm nay ắt phải bỏ xác dưới mưa tên lửa Giang Nam!',
      rightLine:
        'Tiểu kế Hỏa Công hòng dọa được đại quân Trung Nguyên sao?! Toàn quân giương khiên tiến lên đạp bằng doanh địch!',
    };
  }

  return {
    leftLine: GENERAL_OPENING_TAUNTS[leftGen],
    rightLine: GENERAL_OPENING_REPLIES[rightGen],
  };
}

/** Chọn binh chủng đại diện hiển thị thẻ & chỉ số nền dự phòng cho Danh Tướng theo Ngũ Hành */
function representativeUnitKindForGeneral(genId: TwGeneralId, cls: TwGeneralClass): TwUnitKind {
  if (genId === 'sima_xiangan') return 'imperial_cataphracts';
  if (genId === 'lu_bu' || genId === 'zhao_yun') return 'jade_dragons';
  if (genId === 'guan_yu') return 'azure_dragons';
  switch (cls) {
    case 'vanguard':
      return 'jade_dragons';
    case 'champion':
      return 'azure_dragons';
    case 'sentinel':
      return 'jian_sword_guards';
    case 'commander':
      return 'yellow_dragons';
    case 'strategist':
      return 'onyx_dragons';
  }
}

function clamp(val: number, min: number, max: number): number {
  return val < min ? min : val > max ? max : val;
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

function isAliveReg(reg: TwSimRegiment): boolean {
  return reg.men > 0 && reg.hp > 0 && reg.anim !== 'dead';
}

function isFightingReg(reg: TwSimRegiment): boolean {
  return (
    reg.men > 0 &&
    reg.hp > 0 &&
    reg.anim !== 'dead' &&
    reg.moraleState !== 'routing' &&
    reg.moraleState !== 'shattered'
  );
}

// ============================================================================
// LỚP ĐIỀU PHỐI CHIẾN TRƯỜNG MÁY CHỦ (`TwWorld`)
// ============================================================================

export class TwWorld {
  readonly map: TwMapSpec;
  readonly W: number;
  readonly H: number;

  sides: TwSide[] = [];
  regiments: TwSimRegiment[] = [];
  private regsById = new Map<number, TwSimRegiment>();

  projectiles: TwLiveProjectile[] = [];
  duels: TwActiveDuel[] = [];
  captures: TwCaptureState[] = [];
  banters: TwBanterEvent[] = [];
  fires: TwLiveFireZone[] = [];
  deployables: TwLiveDeployable[] = [];

  battlePhase: TwBattlePhase = 'battle';
  deploymentLeftSec = 0;
  battleSpeed: TwBattleSpeed = 1;
  windAngle = 0.38;
  windStrength = 0.58;

  tickNo = 0;
  elapsed = 0;
  readonly startedAt = Date.now();
  readonly endsAt: number;
  result?: TwResult;

  private spawnPoses: TwSpawnPose[] = [];
  private deployZones: TwDeployZoneSpec[] = [];
  private speedTickAcc = 0;
  private openingBanterEmitted = false;
  private battleStartTick = 0;
  private slainGeneralIds = new Set<number>();

  private regSeq = 0;
  private projSeq = 0;
  private duelSeq = 0;
  private banterSeq = 0;
  private fireSeq = 0;
  private deployableSeq = 0;
  private lastBanterTick = -BANTER_COOLDOWN_TICKS;

  private timer?: NodeJS.Timeout;
  private logs: string[] = [];
  private dirty = false;

  private pendingCommandSfx = new Set<TwSfxEvent>();
  private lastSfxEvents: TwSfxEvent[] = [];

  private balanceOfPowerCache: number[] = [];
  private sideSummaryCache: TwSideSummary[] = [];
  private projectileFramesCache: TwProjectileFrame[] = [];
  private duelFramesCache: TwDuelFrame[] = [];
  private fireFramesCache: TwFireZoneFrame[] = [];
  private spectatorFrameCache?: TwFrame;
  private teamFrameCache = new Map<number, TwFrame>();
  private viewerFrameCache = new Map<number, TwFrame>();

  /** Đếm số nhịp liên tục mỗi Liên Minh nắm giữ >= 2/3 Đài Hiệu Lệnh ở mức 100% */
  private captureHoldTicksByTeam = new Map<number, number>();
  private captureWarned20SecTeams = new Set<number>();

  private readonly onTickCallback: () => void;
  private readonly onChangedCallback?: () => void;

  constructor(
    seats: TwSeatInit[],
    readonly config: TwConfig,
    onTick: TwWorldTickCallback,
  ) {
    if (typeof onTick === 'function') {
      this.onTickCallback = onTick;
    } else {
      this.onTickCallback = () => onTick.tick();
      this.onChangedCallback = onTick.changed ? () => onTick.changed!() : undefined;
    }

    this.map = TW_MAPS[config.mapId] ?? getTwMapSpec(config.mapId);
    this.W = this.map.width;
    this.H = this.map.height;
    this.endsAt = this.startedAt + config.durationMin * 60_000;
    this.captures = createInitialCaptureStates(this.map);

    this.battlePhase = config.deploymentPhase ? 'deployment' : 'battle';
    this.deploymentLeftSec = config.deploymentPhase ? 25 : 0;
    this.windAngle = this.map.id === 'chibi' ? Math.PI * 1.25 : 0.38;
    this.windStrength = this.map.id === 'chibi' ? 0.82 : 0.58;

    const seatTeams = seats.map((s) => s.team);
    const spawnPoses = computeSpawnPositions(
      this.map,
      seats.length,
      config.mode,
      seatTeams,
    );
    this.spawnPoses = spawnPoses;
    this.deployZones = spawnPoses.map((pose) =>
      computeDeployZoneForPose(this.map, pose, seats.length > 2),
    );

    // Khi có 5..8 chư hầu trên chiến trường, mỗi Danh Tướng xuất 3 trung đoàn bộ tùy chọn lọc (12 chư hầu x 8 ≈ 96 trung đoàn)
    // để duy trì mô phỏng siêu mượt; với 2..4 chư hầu xuất đủ 3 Tướng + 12 Trung Đoàn = 15 đạo quân (~1.200–1.500 binh sĩ/phe).
    const compactRetinue = seats.length > 4;

    seats.forEach((seat, idx) => {
      const factionSpec = TW_FACTIONS[seat.faction] ?? TW_FACTIONS.wei;
      const customLoadout = seat.loadout
        ? normalizeTwLoadout(seat.loadout, factionSpec.id)
        : undefined;
      const generals: [TwGeneralId, TwGeneralId, TwGeneralId] = customLoadout
        ? [...customLoadout.generals]
        : [
            factionSpec.defaultGenerals[0],
            factionSpec.defaultGenerals[1],
            factionSpec.defaultGenerals[2],
          ];
      const hasStrategist = generals.some((gid) => TW_GENERALS[gid].class === 'strategist');
      const baseTrapQuota = hasStrategist ? 3 : 2;

      const side: TwSide = {
        idx,
        id: seat.id,
        name: seat.name,
        faction: factionSpec.id,
        color: seat.color,
        team: seat.team,
        bot: seat.bot,
        alive: true,
        resigned: false,
        readyDeploy: !config.deploymentPhase,
        deployablesLeft: {
          stakes: baseTrapQuota,
          caltrops: baseTrapQuota,
          oil: baseTrapQuota,
        },
        generals,
        initialMen: 0,
        totalMen: 0,
        regimentsAlive: 0,
        kills: 0,
        score: 0,
        tokens: TW_CMD_BURST,
      };
      this.sides.push(side);

      const pose = spawnPoses[idx] ?? {
        x: this.W * 0.5,
        y: this.H * 0.5,
        facing: 0,
      };
      this.deployWarlordArmy(
        side,
        pose.x,
        pose.y,
        pose.facing,
        compactRetinue,
        seats.length > 2,
        customLoadout?.retinues,
      );
    });

    // Khởi tạo thông số địa hình, ẩn nấp rừng thông, hào quang Ngũ Hành và bảng tổng hợp từ nhịp 0
    this.refreshInitialBattlefieldState();
  }

  // ==========================================================================
  // VÒNG ĐỜI MÔ PHỎNG & TRUY VẤN PHÒNG CHƠI (`game.ts` LIFECYCLE)
  // ==========================================================================

  get tick(): number {
    return this.tickNo;
  }

  get running(): boolean {
    return !!this.timer;
  }

  start(): void {
    if (this.timer || this.result) return;
    this.timer = setInterval(() => {
      try {
        this.stepTimerTick();
      } catch (error) {
        console.error('[TwWorld] Lỗi mô phỏng chiến trường:', error);
      }
    }, TW_TICK_MS);
  }

  /**
   * Bước nhịp hẹn giờ thực tế theo bộ điều tốc độ Chiến Thuật (`⏸ 0× · ½× · 1× · 2× · 3×`):
   * - `0×` (Tạm Dừng Chiến Thuật): dừng vật lý, vẫn nạp nhẹ token để người chơi vẽ đội hình / hàng đợi lệnh và phát lại khung hình.
   * - `0.5×`: bước mô phỏng mỗi 2 nhịp hẹn giờ.
   * - `1×` / `2×` / `3×`: bước tương ứng 1, 2 hoặc 3 nhịp mô phỏng mỗi chu kỳ 67ms.
   */
  stepTimerTick(): void {
    if (this.result) return;

    if (this.battleSpeed === 0 && this.battlePhase === 'battle') {
      for (let i = 0; i < this.sides.length; i++) {
        const s = this.sides[i];
        if (s.alive) {
          s.tokens = Math.min(TW_CMD_BURST, s.tokens + TW_CMD_REFILL * DT_SEC);
        }
      }
      if (this.pendingCommandSfx.size > 0) {
        this.lastSfxEvents = Array.from(this.pendingCommandSfx);
        this.pendingCommandSfx.clear();
      } else {
        this.lastSfxEvents = [];
      }
      this.recomputeSummariesAndPower();
      this.invalidateFrameCaches();
      if (this.dirty || this.logs.length > 0) {
        this.dirty = false;
        this.onChangedCallback?.();
      }
      this.onTickCallback();
      return;
    }

    const effSpeed = this.battlePhase === 'deployment' ? 1 : this.battleSpeed;
    this.speedTickAcc += effSpeed;
    const subSteps = Math.min(3, Math.floor(this.speedTickAcc + 1e-6));
    this.speedTickAcc = Math.max(0, this.speedTickAcc - subSteps);

    for (let k = 0; k < subSteps; k++) {
      if (this.result) break;
      this.step();
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  drainLogs(): string[] {
    if (this.logs.length === 0) return [];
    const out = this.logs;
    this.logs = [];
    return out;
  }

  sideById(id: string): TwSide | undefined {
    return this.sides.find((s) => s.id === id);
  }

  allied(aIdx: number, bIdx: number): boolean {
    const sa = this.sides[aIdx];
    const sb = this.sides[bIdx];
    return !!sa && !!sb && sa.team === sb.team;
  }

  publicInfo(): TwPlayerInfo[] {
    return this.sides.map((s) => ({
      idx: s.idx,
      id: s.id,
      name: s.name,
      faction: s.faction,
      color: s.color,
      team: s.team,
      bot: s.bot,
      alive: s.alive,
      generals: [...s.generals] as [TwGeneralId, TwGeneralId, TwGeneralId],
    }));
  }

  teamName(team: number): string {
    if (this.config.mode === 'historical_2teams') {
      return TW_TEAM_NAMES[team] ?? `Liên Minh ${team + 1}`;
    }
    const leader = this.sides.find((s) => s.team === team);
    return leader ? `${leader.name} (${TW_FACTIONS[leader.faction].vnName})` : `Phe ${team + 1}`;
  }

  /**
   * Xử lý chư hầu xin hàng / rời trận (`playerOrIdx` nhận cả `playerId: string` hoặc `sideIdx: number`
   * để tương thích tuyệt đối với mọi cách gọi từ `game.ts`).
   */
  resign(playerOrIdx: string | number): void {
    const side =
      typeof playerOrIdx === 'number'
        ? this.sides[playerOrIdx]
        : this.sideById(playerOrIdx);
    if (!side || !side.alive || this.result) return;

    side.resigned = true;
    side.alive = false;

    // Giải phóng các vòng Đơn Đấu nếu có Danh Tướng của phe xin hàng đang giao đấu
    for (let i = this.duels.length - 1; i >= 0; i--) {
      const duel = this.duels[i];
      const genA = this.regsById.get(duel.genARegId);
      const genB = this.regsById.get(duel.genBRegId);
      if (genA?.ownerIdx === side.idx || genB?.ownerIdx === side.idx) {
        if (genA) {
          genA.duelId = undefined;
          if (genA.ownerIdx !== side.idx && isAliveReg(genA)) genA.anim = 'idle';
        }
        if (genB) {
          genB.duelId = undefined;
          if (genB.ownerIdx !== side.idx && isAliveReg(genB)) genB.anim = 'idle';
        }
        this.duels.splice(i, 1);
      }
    }

    for (let i = 0; i < this.regiments.length; i++) {
      const reg = this.regiments[i];
      if (reg.ownerIdx !== side.idx || !isAliveReg(reg)) continue;
      reg.morale = 0;
      reg.moraleState = 'shattered';
      reg.anim = 'rout';
      reg.lockedTargetId = undefined;
      reg.engagedWithId = undefined;
      reg.moveTargetX = undefined;
      reg.moveTargetY = undefined;
      reg.moveTargetFacing = undefined;
      reg.chargeTicks = 0;
      reg.bracedTicks = 0;
    }

    this.pendingCommandSfx.add('rout');
    this.logs.push(
      `🏳️ Chư hầu ${side.name} (${TW_FACTIONS[side.faction].vnName}) đã hạ đại kỳ xin hàng — toàn quân tan rã!`,
    );
    this.dirty = true;

    this.recomputeSummariesAndPower();
    this.checkVictoryConditions(this.pendingCommandSfx);
    this.invalidateFrameCaches();
  }

  // ==========================================================================
  // 1. TRIỂN KHAI ĐỘI HÌNH KHAI CHIẾN 2 TUYẾN CHUẨN TOTAL WAR
  // ==========================================================================

  private deployWarlordArmy(
    side: TwSide,
    anchorX: number,
    anchorY: number,
    facing: number,
    compactRetinue: boolean,
    multiWarlord: boolean,
    customRetinues?: TwArmyLoadout['retinues'],
  ): void {
    const normFacing = normalizeAngle(facing);
    const fwdX = Math.cos(normFacing);
    const fwdY = Math.sin(normFacing);
    const latX = -fwdY;
    const latY = fwdX;

    const sideGenRegs: TwSimRegiment[] = [];
    const sideRetinueRegs: TwSimRegiment[] = [];

    const hasStrategistInArmy = side.generals.some(
      (gid) => TW_GENERALS[gid].class === 'strategist',
    );

    for (let slot = 0; slot < TW_GENERALS_PER_PLAYER; slot++) {
      const genId = side.generals[slot];
      const genSpec = TW_GENERALS[genId];
      const repKind = representativeUnitKindForGeneral(genId, genSpec.class);

      // Tạo đơn vị Danh Tướng chỉ huy (men = 1 chuẩn `combat.ts` & `duel.ts`)
      const genMaxHp = this.config.romanceMode
        ? genSpec.hp
        : Math.round(genSpec.hp * 0.85);
      const genReg = this.createSimRegiment({
        ownerIdx: side.idx,
        team: side.team,
        generalSlot: slot,
        kind: repKind,
        isGeneral: true,
        generalId: genId,
        maxMen: 1,
        maxHp: genMaxHp,
        maxAmmo: 0,
        morale: 90,
        facing: normFacing,
      });
      sideGenRegs.push(genReg);

      // Chọn danh sách trung đoàn bộ tùy (ưu tiên cấu hình Chiêu Mộ `customRetinues[slot]`, hoặc 4 đạo mặc định của Tướng)
      const fullRetinue = customRetinues?.[slot] ?? genSpec.defaultRetinue;
      const selectedKinds: TwUnitKind[] = compactRetinue
        ? [fullRetinue[0], fullRetinue[2], fullRetinue[3]]
        : fullRetinue.slice(0, TW_RETINUE_PER_GENERAL);

      for (let rIdx = 0; rIdx < selectedKinds.length; rIdx++) {
        const uKind = selectedKinds[rIdx];
        const uSpec = TW_UNITS[uKind];
        const scaledMen = twScaledMaxMen(uKind, this.config.armyScale);
        const maxHp = scaledMen * uSpec.hpPerMan;

        // Áp dụng thưởng cơ số đạn từ Mưu Sĩ hệ Thủy (+20%) và Thế lực Viên Thiệu (+10%)
        let maxAmmo = uSpec.maxAmmo;
        if (maxAmmo > 0) {
          const stratMul =
            genSpec.class === 'strategist' ? 1.2 : hasStrategistInArmy ? 1.1 : 1.0;
          const factionAmmoMul = side.faction === 'yuan' ? 1.1 : 1.0;
          maxAmmo = Math.round(maxAmmo * stratMul * factionAmmoMul);
        }

        // Thưởng Sĩ khí khởi đầu cho dân binh Thục Hán (+8) hoặc hào quang lân cận Viên Thiệu (+6)
        let initMorale = uSpec.moraleBase + 12;
        if (side.faction === 'shu' && uKind.endsWith('_militia')) {
          initMorale += 8;
        } else if (side.faction === 'yuan') {
          initMorale += 6;
        }
        initMorale = clamp(initMorale, 45, 95);

        const isCavKind =
          uSpec.category === 'cavalry_shock' || uSpec.category === 'cavalry_melee';
        const isArtKind = uSpec.category === 'artillery';
        const initBlockWidth = isArtKind
          ? undefined
          : multiWarlord || compactRetinue
            ? isCavKind
              ? 90
              : 104
            : isCavKind
              ? 108
              : 132;

        const retReg = this.createSimRegiment({
          ownerIdx: side.idx,
          team: side.team,
          generalSlot: slot,
          kind: uKind,
          isGeneral: false,
          maxMen: scaledMen,
          maxHp,
          maxAmmo,
          morale: initMorale,
          facing: normFacing,
          customWidth: initBlockWidth,
        });
        sideRetinueRegs.push(retReg);
      }
    }

    // Phân loại bộ tùy để dàn trận 2 hàng chuẩn binh pháp Total War:
    // - Tuyến 1 (Tiền quân): Bộ binh Trường Thương giữ hai đầu sườn chống kỵ + Bộ binh Đao Kiếm ở trung tâm.
    // - Hai Cánh (Tả dực / Hữu dực): Kỵ binh Xung kích & Kỵ binh Chiến đao bảo vệ hai biên.
    // - Tuyến 2 (Hậu quân): Cung thủ, Liên Châu Nỏ và Pháo Đá Uy Viễn yểm trợ hỏa lực qua đầu bộ binh.
    // - Tuyến Chỉ Huy: 3 Danh Tướng trấn giữ ngay phía sau cánh quân Bộ Tùy tương ứng của mình.
    const polearms: TwSimRegiment[] = [];
    const swords: TwSimRegiment[] = [];
    const archersAndCrossbows: TwSimRegiment[] = [];
    const artillery: TwSimRegiment[] = [];
    const cavalry: TwSimRegiment[] = [];

    for (let i = 0; i < sideRetinueRegs.length; i++) {
      const r = sideRetinueRegs[i];
      const cat = TW_UNITS[r.kind].category;
      switch (cat) {
        case 'infantry_polearm':
          polearms.push(r);
          break;
        case 'infantry_sword':
          swords.push(r);
          break;
        case 'ranged_bow':
        case 'ranged_crossbow':
          archersAndCrossbows.push(r);
          break;
        case 'artillery':
          artillery.push(r);
          break;
        case 'cavalry_shock':
        case 'cavalry_melee':
          cavalry.push(r);
          break;
      }
    }

    // Chia Trường Thương sang hai bên sườn của Đao Kiếm để tạo lá chắn phản kỵ hoàn hảo
    const leftPoleCount = Math.ceil(polearms.length * 0.5);
    const frontInfantry: TwSimRegiment[] = [
      ...polearms.slice(0, leftPoleCount),
      ...swords,
      ...polearms.slice(leftPoleCount),
    ];

    // Đặt Tuyến 1 (Bộ binh cận chiến)
    const placeHorizontalRow = (
      rowRegs: TwSimRegiment[],
      forwardOffset: number,
      gap: number,
    ): number => {
      if (rowRegs.length === 0) return 0;
      const totalSpan =
        rowRegs.reduce((sum, r) => sum + r.width, 0) + gap * (rowRegs.length - 1);
      let cursor = -totalSpan * 0.5;
      const baseX = anchorX + fwdX * forwardOffset;
      const baseY = anchorY + fwdY * forwardOffset;

      for (let i = 0; i < rowRegs.length; i++) {
        const reg = rowRegs[i];
        const latOffset = cursor + reg.width * 0.5;
        cursor += reg.width + gap;
        const clamped = clampToBattlefield(
          this.map,
          baseX + latX * latOffset,
          baseY + latY * latOffset,
          62,
        );
        reg.x = round1(clamped.x);
        reg.y = round1(clamped.y);
      }
      return totalSpan;
    };

    const frontSpan = placeHorizontalRow(frontInfantry, 0, DEPLOY_FRONT_GAP);

    // Đặt Kỵ binh ở hai cánh Trái & Phải của Tuyến 1 (hơi lùi nhẹ 18 đơn vị tạo thế cánh cung bọc sườn)
    if (cavalry.length > 0) {
      const leftCavCount = Math.ceil(cavalry.length * 0.5);
      const leftWing = cavalry.slice(0, leftCavCount);
      const rightWing = cavalry.slice(leftCavCount);
      const halfFront = frontSpan > 0 ? frontSpan * 0.5 : 40;
      const wingBaseX = anchorX - fwdX * 18;
      const wingBaseY = anchorY - fwdY * 18;

      let leftCursor = -(halfFront + DEPLOY_WING_GAP);
      for (let i = leftWing.length - 1; i >= 0; i--) {
        const cav = leftWing[i];
        const latOffset = leftCursor - cav.width * 0.5;
        leftCursor -= cav.width + DEPLOY_FRONT_GAP;
        const clamped = clampToBattlefield(
          this.map,
          wingBaseX + latX * latOffset,
          wingBaseY + latY * latOffset,
          62,
        );
        cav.x = round1(clamped.x);
        cav.y = round1(clamped.y);
      }

      let rightCursor = halfFront + DEPLOY_WING_GAP;
      for (let i = 0; i < rightWing.length; i++) {
        const cav = rightWing[i];
        const latOffset = rightCursor + cav.width * 0.5;
        rightCursor += cav.width + DEPLOY_FRONT_GAP;
        const clamped = clampToBattlefield(
          this.map,
          wingBaseX + latX * latOffset,
          wingBaseY + latY * latOffset,
          62,
        );
        cav.x = round1(clamped.x);
        cav.y = round1(clamped.y);
      }
    }

    // Đặt Tuyến 2 (Cung Nỏ & Pháo Đá Uy Viễn): Cung Nỏ ở hàng 2 (-94), Pháo Đá ở trung tâm hàng 2 lùi nhẹ (-122)
    placeHorizontalRow(archersAndCrossbows, -DEPLOY_SECOND_RANK_OFFSET, DEPLOY_FRONT_GAP + 4);
    if (artillery.length > 0) {
      placeHorizontalRow(
        artillery,
        -(DEPLOY_SECOND_RANK_OFFSET + DEPLOY_TREBUCHET_EXTRA_OFFSET),
        DEPLOY_FRONT_GAP + 14,
      );
    }

    // Đặt 3 Danh Tướng ngay phía sau Bộ Tùy theo từng `generalSlot` (tránh chồng chéo nhau)
    const fallbackSlotOffsets = [-165, 0, 165];
    const usedLatOffsets: number[] = [];

    for (let slot = 0; slot < sideGenRegs.length; slot++) {
      const genReg = sideGenRegs[slot];
      const myRetinues = sideRetinueRegs.filter((r) => r.generalSlot === slot);
      let latProj = fallbackSlotOffsets[slot] ?? 0;

      if (myRetinues.length > 0) {
        let sumLat = 0;
        for (let k = 0; k < myRetinues.length; k++) {
          const r = myRetinues[k];
          sumLat += (r.x - anchorX) * latX + (r.y - anchorY) * latY;
        }
        latProj = sumLat / myRetinues.length;
      }

      // Giữ khoảng cách tối thiểu 78 đơn vị ngang giữa các Danh Tướng cùng phe
      for (let u = 0; u < usedLatOffsets.length; u++) {
        if (Math.abs(latProj - usedLatOffsets[u]) < 78) {
          latProj =
            usedLatOffsets[u] + (slot === 0 ? -84 : slot === 2 ? 84 : 84);
        }
      }
      usedLatOffsets.push(latProj);

      const genClamped = clampToBattlefield(
        this.map,
        anchorX - fwdX * DEPLOY_GENERAL_RANK_OFFSET + latX * latProj,
        anchorY - fwdY * DEPLOY_GENERAL_RANK_OFFSET + latY * latProj,
        62,
      );
      genReg.x = round1(genClamped.x);
      genReg.y = round1(genClamped.y);
    }

    // Ghi danh toàn bộ Trung đoàn vào Thế giới theo thứ tự từng Đạo Tướng (General -> Retinues)
    // để thanh thẻ quân phía dưới màn hình nhóm đúng cụm Tướng + 4 Bộ Tùy!
    let initialMen = 0;
    for (let slot = 0; slot < sideGenRegs.length; slot++) {
      const genReg = sideGenRegs[slot];
      this.registerRegiment(genReg);
      initialMen += genReg.maxMen;

      for (let r = 0; r < sideRetinueRegs.length; r++) {
        const ret = sideRetinueRegs[r];
        if (ret.generalSlot === slot) {
          this.registerRegiment(ret);
          initialMen += ret.maxMen;
        }
      }
    }

    side.initialMen = initialMen;
    side.totalMen = initialMen;
    side.regimentsAlive = sideGenRegs.length + sideRetinueRegs.length;
  }

  private createSimRegiment(params: {
    ownerIdx: number;
    team: number;
    generalSlot: number;
    kind: TwUnitKind;
    isGeneral: boolean;
    generalId?: TwGeneralId;
    maxMen: number;
    maxHp: number;
    maxAmmo: number;
    morale: number;
    facing: number;
    customWidth?: number;
  }): TwSimRegiment {
    const unitSpec = TW_UNITS[params.kind];
    const isRangedOrArtillery = !params.isGeneral && unitSpec.range > 0;
    const moraleState = params.morale >= 75 ? 'eager' : 'steady';

    const reg: TwSimRegiment = {
      id: ++this.regSeq,
      ownerIdx: params.ownerIdx,
      team: params.team,
      generalSlot: params.generalSlot,
      kind: params.kind,
      isGeneral: params.isGeneral,
      generalId: params.generalId,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      facing: params.facing,
      width: 40,
      depth: 24,
      cols: 1,
      men: params.maxMen,
      maxMen: params.maxMen,
      hp: params.maxHp,
      maxHp: params.maxHp,
      morale: params.morale,
      moraleState,
      fatigueVal: 0,
      fatigue: 'fresh',
      ammo: params.maxAmmo,
      maxAmmo: params.maxAmmo,
      formation: 'line',
      anim: 'idle',
      hidden: false,
      inForest: false,
      onHighGround: false,
      inRiver: false,
      inMud: false,
      guardMode: false,
      fireAtWill: isRangedOrArtillery,
      skirmishMode: false,
      runOrder: true,
      customWidth: params.customWidth,
      reloadLeftSec: 0,
      chargeTicks: 0,
      bracedTicks: 0,
      skillCooldownLeft: 0,
      activeBuff: undefined,
      activeBuffLeftSec: 0,
      auraAtkMul: 1.0,
      auraDefAdd: 0,
      auraSpeedMul: 1.0,
      auraMoraleAdd: 0,
      fireArrowActive: false,
      kills: 0,
    };

    recomputeRegimentDimensions(reg);
    return reg;
  }

  private registerRegiment(reg: TwSimRegiment): void {
    this.regiments.push(reg);
    this.regsById.set(reg.id, reg);
  }

  private refreshInitialBattlefieldState(): void {
    for (let i = 0; i < this.regiments.length; i++) {
      const reg = this.regiments[i];
      const terr = sampleTerrainAt(this.map, reg.x, reg.y);
      reg.inForest = terr.inForest;
      reg.onHighGround = terr.onHighGround;
      reg.inRiver = terr.inRiver;
      reg.inMud = terr.inMud;
    }

    const noopSfx = new Set<TwSfxEvent>();
    stepMoraleAndAuras(this.regiments, DT_SEC, noopSfx);

    const aliveSpotters = this.regiments.filter(isAliveReg);
    for (let i = 0; i < this.regiments.length; i++) {
      const reg = this.regiments[i];
      reg.hidden = isAliveReg(reg)
        ? isRegimentHidden(reg, aliveSpotters, reg.team)
        : false;
    }

    this.recomputeSummariesAndPower();
    this.invalidateFrameCaches();
  }

  private projectIntoDeployZone(
    x: number,
    y: number,
    zone: TwDeployZoneSpec,
  ): { x: number; y: number } {
    const dx = x - zone.x;
    const dy = y - zone.y;
    const c = Math.cos(zone.rot);
    const s = Math.sin(zone.rot);
    let lx = dx * c + dy * s;
    let ly = -dx * s + dy * c;
    const rx = Math.max(40, zone.rx * 0.92);
    const ry = Math.max(40, zone.ry * 0.92);
    const norm = Math.hypot(lx / rx, ly / ry);
    if (norm > 1) {
      lx /= norm;
      ly /= norm;
    }
    return clampToBattlefield(
      this.map,
      zone.x + lx * c - ly * s,
      zone.y + lx * s + ly * c,
      44,
    );
  }

  private areAllReadyForBattle(): boolean {
    const aliveHumans = this.sides.filter((s) => s.alive && !s.bot);
    if (aliveHumans.length > 0) {
      return aliveHumans.every((s) => s.readyDeploy);
    }
    const aliveAll = this.sides.filter((s) => s.alive);
    return aliveAll.length > 0 && aliveAll.every((s) => s.readyDeploy);
  }

  private startBattleFromDeployment(sfxOut?: Set<TwSfxEvent>): void {
    if (this.battlePhase !== 'deployment') return;

    // Nếu người chơi bấm Khai Chiến sớm trước khi Máy AI kịp chạy nhịp bố trận đầu tiên,
    // cho phép AI thực hiện ngay lượt bố trí Phục Binh Rừng Thông & Bẫy Chiến Trường!
    for (let i = 0; i < this.sides.length; i++) {
      const bs = this.sides[i];
      if (!bs.bot || !bs.alive || bs.readyDeploy) continue;
      const thinkMul =
        this.config.botDifficulty === 'easy'
          ? 20
          : this.config.botDifficulty === 'hard'
            ? 9
            : 12;
      const alignedTick =
        thinkMul - ((Math.abs(Math.floor(bs.idx)) * 5) % thinkMul);
      stepTwBotSide(
        bs.idx,
        bs.team,
        this.map,
        this.regiments,
        this.captures,
        alignedTick,
        (botCmd) => {
          if (botCmd.t !== 'ready_deploy') {
            this.command(bs.idx, botCmd);
          }
        },
        {
          romanceMode: this.config.romanceMode,
          botDifficulty: this.config.botDifficulty,
          battlePhase: 'deployment',
          deployZone: this.deployZones[bs.idx],
          deployablesLeft: bs.deployablesLeft,
          readyDeploy: false,
          deployables: this.deployables,
          fires: this.fires,
        },
      );
      bs.readyDeploy = true;
    }

    this.battlePhase = 'battle';
    this.deploymentLeftSec = 0;
    this.battleStartTick = this.tickNo;
    for (let i = 0; i < this.sides.length; i++) {
      this.sides[i].readyDeploy = true;
    }

    const targetSfx = sfxOut ?? this.pendingCommandSfx;
    targetSfx.add('horn');
    targetSfx.add('drums');
    this.logs.push(
      '🥁 Trống trận vang rền — Đại quân các Chư Hầu chính thức Khai Chiến!',
    );
    this.dirty = true;
    this.refreshInitialBattlefieldState();
  }

  // ==========================================================================
  // 2. XỬ LÝ 13 LOẠI LỆNH ĐIỀU BINH TỪ NGƯỜI CHƠI & MÁY (`command`)
  // ==========================================================================

  /**
   * Nhận lệnh điều khiển đại quân từ người chơi hoặc AI Warlord.
   * Chấp nhận cả `playerId: string` lẫn `sideIdx: number` để tương thích hoàn toàn với `game.ts`.
   * Trả về chuỗi thông báo lỗi tiếng Việt nếu lệnh không hợp lệ, hoặc `undefined` khi thành công.
   */
  command(playerIdOrIdx: string | number, cmd: TwCommand): string | undefined {
    const side =
      typeof playerIdOrIdx === 'number'
        ? this.sides[playerIdOrIdx]
        : this.sideById(playerIdOrIdx);

    if (!side || !side.alive || this.result) {
      return 'Đại quân của bạn đã rời khỏi chiến trường.';
    }
    if (!cmd || typeof cmd !== 'object' || typeof cmd.t !== 'string') {
      return 'Hiệu lệnh quân sự không hợp lệ.';
    }

    // Lệnh xin hàng, sẵn sàng khai chiến & đổi tốc độ không bị chặn bởi giới hạn token
    if (cmd.t === 'resign') {
      this.resign(side.idx);
      return undefined;
    }

    if (cmd.t === 'set_speed') {
      if (
        typeof cmd.speed !== 'number' ||
        !(TW_BATTLE_SPEEDS as readonly number[]).includes(cmd.speed)
      ) {
        return 'Tốc độ chiến trường không hợp lệ.';
      }
      const humanCount = this.sides.filter((s) => !s.bot && s.alive).length;
      if (humanCount > 1 && side.idx !== 0) {
        return 'Chỉ Chủ Phòng mới có quyền đổi tốc độ chiến trường khi đấu nhiều người.';
      }
      this.battleSpeed = cmd.speed as TwBattleSpeed;
      this.speedTickAcc = 0;
      this.invalidateFrameCaches();
      this.onTickCallback();
      return undefined;
    }

    if (cmd.t === 'ready_deploy') {
      if (this.battlePhase !== 'deployment') return undefined;
      side.readyDeploy = cmd.ready !== false;
      if (this.areAllReadyForBattle()) {
        this.startBattleFromDeployment();
        if (this.dirty || this.logs.length > 0) {
          this.dirty = false;
          this.onChangedCallback?.();
        }
      } else {
        this.recomputeSummariesAndPower();
        this.invalidateFrameCaches();
      }
      this.onTickCallback();
      return undefined;
    }

    // Giới hạn tốc độ gửi lệnh chống spam
    if (side.tokens < 1) {
      return undefined;
    }
    side.tokens -= 1;

    switch (cmd.t) {
      case 'move_line': {
        if (!Number.isFinite(cmd.x) || !Number.isFinite(cmd.y)) {
          return 'Tọa độ hành quân không hợp lệ.';
        }
        const selected = this.getControllableOwnedRegs(side.idx, cmd.regIds);
        if (selected.length === 0) return undefined;

        const clampedDest = clampToBattlefield(this.map, cmd.x, cmd.y, 44);
        let facing: number;
        if (Number.isFinite(cmd.facing)) {
          facing = normalizeAngle(cmd.facing);
        } else {
          let cx = 0;
          let cy = 0;
          for (let i = 0; i < selected.length; i++) {
            cx += selected[i].x;
            cy += selected[i].y;
          }
          cx /= selected.length;
          cy /= selected.length;
          facing = Math.atan2(clampedDest.y - cy, clampedDest.x - cx);
        }

        const customSpan =
          cmd.width !== undefined && Number.isFinite(cmd.width) && cmd.width > 20
            ? clamp(cmd.width, 28, 1900)
            : undefined;

        const lineTargets = computeMultiRegimentLineTargets(
          selected,
          clampedDest.x,
          clampedDest.y,
          facing,
          customSpan,
        );

        // Trong Pha Bố Trận Tiền Chiến (`deployment`): đặt tức thì (snap) vị trí & hướng mặt trong Vùng Bố Trận hoặc Rừng Tiên Phong!
        if (this.battlePhase === 'deployment') {
          const myZone = this.deployZones[side.idx];
          const enemyPoses = this.spawnPoses.filter(
            (_, idx) => this.sides[idx] && this.sides[idx].team !== side.team,
          );

          for (let i = 0; i < lineTargets.length; i++) {
            const tgt = lineTargets[i];
            const reg = this.regsById.get(tgt.regId);
            if (!reg || reg.ownerIdx !== side.idx) continue;

            if (tgt.width !== undefined) {
              reg.customWidth = tgt.width;
              recomputeRegimentDimensions(reg);
            }

            const vanguardAllowed = reg.isGeneral
              ? reg.generalId !== undefined &&
                (TW_GENERALS[reg.generalId].class === 'vanguard' ||
                  TW_GENERALS[reg.generalId].class === 'champion')
              : Boolean(TW_UNITS[reg.kind].vanguardDeploy);

            let safePt = clampToBattlefield(this.map, tgt.x, tgt.y, 44);
            if (
              myZone &&
              !isValidDeploymentPosition(
                this.map,
                myZone,
                safePt.x,
                safePt.y,
                vanguardAllowed,
                enemyPoses,
              )
            ) {
              safePt = this.projectIntoDeployZone(safePt.x, safePt.y, myZone);
            }

            reg.x = round1(safePt.x);
            reg.y = round1(safePt.y);
            reg.facing = tgt.facing;
            reg.vx = 0;
            reg.vy = 0;
            reg.moveTargetX = undefined;
            reg.moveTargetY = undefined;
            reg.moveTargetFacing = undefined;
            reg.lockedTargetId = undefined;
            reg.fatigueVal = 0;
            reg.fatigue = 'fresh';
            reg.chargeTicks = 0;
            reg.bracedTicks = 0;
            reg.anim = 'idle';
          }

          this.refreshInitialBattlefieldState();
          return undefined;
        }

        const shouldRun = cmd.run !== false;
        for (let i = 0; i < lineTargets.length; i++) {
          const tgt = lineTargets[i];
          const reg = this.regsById.get(tgt.regId);
          if (!reg || reg.ownerIdx !== side.idx) continue;

          const safePt = clampToBattlefield(this.map, tgt.x, tgt.y, 40);
          reg.moveTargetX = round1(safePt.x);
          reg.moveTargetY = round1(safePt.y);
          reg.moveTargetFacing = tgt.facing;
          reg.lockedTargetId = undefined;
          reg.runOrder = shouldRun;
          reg.chargeTicks = 0;
          reg.bracedTicks = 0;

          if (tgt.width !== undefined) {
            reg.customWidth = tgt.width;
            recomputeRegimentDimensions(reg);
          }
        }
        if (this.battleSpeed === 0) this.invalidateFrameCaches();
        return undefined;
      }

      case 'attack_target': {
        if (this.battlePhase === 'deployment') {
          return side.bot
            ? undefined
            : 'Trận chiến chưa bắt đầu — hãy bố trận đội hình và nhấn Khai Chiến!';
        }
        if (!Number.isFinite(cmd.targetRegId)) {
          return 'Mục tiêu công kích không hợp lệ.';
        }
        const target = this.regsById.get(Math.floor(cmd.targetRegId));
        if (
          !target ||
          target.team === side.team ||
          !isAliveReg(target) ||
          target.moraleState === 'shattered' ||
          target.hidden
        ) {
          return undefined;
        }
        if (target.duelId !== undefined) {
          return 'Danh tướng đối phương đang giao đấu tay đôi trong vòng Đơn Đấu danh dự!';
        }

        const selected = this.getControllableOwnedRegs(side.idx, cmd.regIds);
        if (selected.length === 0) return undefined;

        for (let i = 0; i < selected.length; i++) {
          const reg = selected[i];
          reg.lockedTargetId = target.id;
          reg.moveTargetX = undefined;
          reg.moveTargetY = undefined;
          reg.moveTargetFacing = undefined;
          reg.runOrder = true;
          reg.bracedTicks = 0;
        }
        if (this.battleSpeed === 0) this.invalidateFrameCaches();
        return undefined;
      }

      case 'halt': {
        const selected = this.getControllableOwnedRegs(side.idx, cmd.regIds);
        for (let i = 0; i < selected.length; i++) {
          const reg = selected[i];
          reg.lockedTargetId = undefined;
          reg.moveTargetX = undefined;
          reg.moveTargetY = undefined;
          reg.moveTargetFacing = undefined;
          reg.vx = 0;
          reg.vy = 0;
          reg.chargeTicks = 0;
        }
        if (this.battleSpeed === 0) this.invalidateFrameCaches();
        return undefined;
      }

      case 'set_formation': {
        if (
          typeof cmd.formation !== 'string' ||
          !(TW_FORMATION_IDS as readonly string[]).includes(cmd.formation)
        ) {
          return 'Trận hình chiến thuật không hợp lệ.';
        }
        const formation = cmd.formation as TwFormation;
        const selected = this.getControllableOwnedRegs(side.idx, cmd.regIds);

        for (let i = 0; i < selected.length; i++) {
          const reg = selected[i];
          const allowed = reg.isGeneral
            ? formation === 'line'
            : TW_UNITS[reg.kind].allowedFormations.includes(formation);
          if (!allowed) continue;
          if (reg.formation === formation && reg.customWidth === undefined) continue;

          reg.formation = formation;
          reg.customWidth = undefined;
          reg.bracedTicks = 0;
          recomputeRegimentDimensions(reg);
        }
        if (this.battleSpeed === 0 || this.battlePhase === 'deployment') {
          this.invalidateFrameCaches();
        }
        return undefined;
      }

      case 'toggle_stance': {
        if (
          cmd.stance !== 'guard' &&
          cmd.stance !== 'fire_at_will' &&
          cmd.stance !== 'skirmish'
        ) {
          return 'Trạng thái tác chiến không hợp lệ.';
        }
        const enabled = Boolean(cmd.value);
        const selected = this.getControllableOwnedRegs(side.idx, cmd.regIds);

        for (let i = 0; i < selected.length; i++) {
          const reg = selected[i];
          if (cmd.stance === 'guard') {
            reg.guardMode = enabled;
          } else if (cmd.stance === 'fire_at_will') {
            if (!reg.isGeneral && TW_UNITS[reg.kind].range > 0) {
              reg.fireAtWill = enabled;
            }
          } else if (cmd.stance === 'skirmish') {
            if (
              !reg.isGeneral &&
              TW_UNITS[reg.kind].range > 0 &&
              TW_UNITS[reg.kind].category !== 'artillery'
            ) {
              reg.skirmishMode = enabled;
            }
          }
        }
        if (this.battleSpeed === 0 || this.battlePhase === 'deployment') {
          this.invalidateFrameCaches();
        }
        return undefined;
      }

      case 'toggle_fire_arrows': {
        const enabled = Boolean(cmd.value);
        const selected = this.getControllableOwnedRegs(side.idx, cmd.regIds);
        for (let i = 0; i < selected.length; i++) {
          const reg = selected[i];
          if (!reg.isGeneral && TW_UNITS[reg.kind].category === 'ranged_bow') {
            reg.fireArrowActive = enabled;
          }
        }
        if (this.battleSpeed === 0 || this.battlePhase === 'deployment') {
          this.invalidateFrameCaches();
        }
        return undefined;
      }

      case 'place_deployable': {
        if (
          cmd.kind !== 'stakes' &&
          cmd.kind !== 'caltrops' &&
          cmd.kind !== 'oil'
        ) {
          return 'Loại đạo cụ chiến trường không hợp lệ.';
        }
        if (!Number.isFinite(cmd.x) || !Number.isFinite(cmd.y)) {
          return 'Tọa độ đặt đạo cụ không hợp lệ.';
        }
        const left = side.deployablesLeft[cmd.kind] ?? 0;
        if (left <= 0) {
          return side.bot
            ? undefined
            : `Đã sử dụng hết cơ số ${TW_DEPLOYABLES[cmd.kind].vnName}!`;
        }

        const pt = clampToBattlefield(this.map, cmd.x, cmd.y, 48);
        const placeFacing = Number.isFinite(cmd.facing)
          ? normalizeAngle(cmd.facing!)
          : 0;

        if (this.battlePhase === 'deployment') {
          const myZone = this.deployZones[side.idx];
          const enemyPoses = this.spawnPoses.filter(
            (_, idx) => this.sides[idx] && this.sides[idx].team !== side.team,
          );
          if (
            myZone &&
            !isValidDeploymentPosition(
              this.map,
              myZone,
              pt.x,
              pt.y,
              true,
              enemyPoses,
            )
          ) {
            return side.bot
              ? undefined
              : 'Trong pha Bố Trận, chỉ được đặt đạo cụ trong Khu Vực Bố Trận hoặc Rừng Phục Kích!';
          }
        } else {
          // Trong trận chiến: cần có ít nhất 1 đạo quân phe mình còn sống & không giáp lá cà đứng trong tầm 265u
          let nearFriendly = false;
          for (let i = 0; i < this.regiments.length; i++) {
            const r = this.regiments[i];
            if (
              r.ownerIdx !== side.idx ||
              !isFightingReg(r) ||
              r.engagedWithId !== undefined
            ) {
              continue;
            }
            if (Math.hypot(r.x - pt.x, r.y - pt.y) <= 265) {
              nearFriendly = true;
              break;
            }
          }
          if (!nearFriendly) {
            return side.bot
              ? undefined
              : 'Cần có trung đoàn phe ta ở gần (trong tầm 265, không giáp lá cà) để dựng đạo cụ!';
          }
          for (let i = 0; i < this.regiments.length; i++) {
            const foe = this.regiments[i];
            if (foe.team === side.team || !isAliveReg(foe)) continue;
            if (Math.hypot(foe.x - pt.x, foe.y - pt.y) < 42) {
              return side.bot
                ? undefined
                : 'Không thể đặt đạo cụ đè trực tiếp lên đội hình quân địch!';
            }
          }
        }

        side.deployablesLeft[cmd.kind] = Math.max(0, left - 1);
        const spec = TW_DEPLOYABLES[cmd.kind];
        const isStealth = spec.stealthUntilDist < 5000;
        this.deployables.push({
          id: ++this.deployableSeq,
          ownerIdx: side.idx,
          team: side.team,
          kind: cmd.kind,
          x: round1(pt.x),
          y: round1(pt.y),
          facing: Math.round(placeFacing * 1000) / 1000,
          radius: spec.radius,
          hp: spec.maxHp,
          maxHp: spec.maxHp,
          hidden: isStealth,
          revealed: !isStealth,
        });

        this.recomputeSummariesAndPower();
        this.invalidateFrameCaches();
        if (this.battleSpeed === 0 || this.battlePhase === 'deployment') {
          this.onTickCallback();
        }
        return undefined;
      }

      case 'duel_action': {
        if (
          !Number.isFinite(cmd.duelId) ||
          (cmd.action !== 'press' &&
            cmd.action !== 'guard' &&
            cmd.action !== 'retreat')
        ) {
          return 'Chiêu thức Đơn Đấu không hợp lệ.';
        }
        const actRes = applyDuelAction(
          this.duels,
          this.regsById,
          this.regiments,
          Math.floor(cmd.duelId),
          side.idx,
          cmd.action,
          this.pendingCommandSfx,
        );
        if (!actRes.ok) {
          return side.bot ? undefined : actRes.reason;
        }
        if (actRes.log) {
          this.logs.push(actRes.log);
          this.dirty = true;
        }
        this.recomputeSummariesAndPower();
        this.invalidateFrameCaches();
        if (this.battleSpeed === 0) {
          this.onTickCallback();
        }
        return undefined;
      }

      case 'use_skill': {
        if (this.battlePhase === 'deployment') {
          return side.bot
            ? undefined
            : 'Chưa thể tung Tuyệt Kỹ trước khi Khai Chiến!';
        }
        if (!Number.isFinite(cmd.generalRegId)) {
          return 'Danh tướng xuất chiêu không hợp lệ.';
        }
        const gen = this.regsById.get(Math.floor(cmd.generalRegId));
        if (!gen || gen.ownerIdx !== side.idx || !gen.isGeneral || !gen.generalId) {
          return 'Không tìm thấy Danh tướng thuộc quyền chỉ huy của bạn.';
        }

        let tx =
          cmd.targetX !== undefined && Number.isFinite(cmd.targetX)
            ? cmd.targetX
            : undefined;
        let ty =
          cmd.targetY !== undefined && Number.isFinite(cmd.targetY)
            ? cmd.targetY
            : undefined;

        if (
          (tx === undefined || ty === undefined) &&
          cmd.targetRegId !== undefined &&
          Number.isFinite(cmd.targetRegId)
        ) {
          const tgtReg = this.regsById.get(Math.floor(cmd.targetRegId));
          if (tgtReg && isAliveReg(tgtReg) && !tgtReg.hidden) {
            tx = tgtReg.x;
            ty = tgtReg.y;
          }
        }

        const skillRes = castGeneralSkill(
          gen,
          this.regiments,
          this.pendingCommandSfx,
          tx,
          ty,
        );
        if (!skillRes.ok) {
          return side.bot
            ? undefined
            : 'Tuyệt kỹ đang hồi chiêu hoặc Danh tướng không thể xuất chiêu lúc này.';
        }
        if (skillRes.spawnFireAt) {
          tryIgniteWildfireAt(
            this.map,
            this.fires,
            this.deployables,
            skillRes.spawnFireAt.x,
            skillRes.spawnFireAt.y,
            skillRes.spawnFireAt.radius,
            side.idx,
            side.team,
            () => ++this.fireSeq,
            true,
            this.pendingCommandSfx,
          );
        }
        if (skillRes.log) {
          this.logs.push(skillRes.log);
          this.dirty = true;
        }
        return undefined;
      }

      case 'challenge_duel': {
        if (this.battlePhase === 'deployment') {
          return side.bot
            ? undefined
            : 'Hãy nhấn Khai Chiến trước khi khiêu chiến Đơn Đấu!';
        }
        if (
          !Number.isFinite(cmd.generalRegId) ||
          !Number.isFinite(cmd.targetGeneralRegId)
        ) {
          return 'Lệnh thách đấu Đơn Đấu không hợp lệ.';
        }
        const challenger = this.regsById.get(Math.floor(cmd.generalRegId));
        const target = this.regsById.get(Math.floor(cmd.targetGeneralRegId));

        if (!challenger || challenger.ownerIdx !== side.idx || !challenger.isGeneral) {
          return 'Danh tướng khiêu chiến không thuộc quyền chỉ huy của bạn.';
        }
        if (!target || !target.isGeneral || target.hidden) {
          return side.bot
            ? undefined
            : 'Tướng địch chưa lộ diện hoặc không hợp lệ để khiêu chiến.';
        }

        const duelRes = tryStartGeneralDuel(
          challenger,
          target,
          this.regiments,
          this.duels,
          () => ++this.duelSeq,
          this.config.romanceMode,
          this.pendingCommandSfx,
        );

        if (duelRes.ok && duelRes.duel) {
          const genASpec = TW_GENERALS[duelRes.duel.generalA];
          const genBSpec = TW_GENERALS[duelRes.duel.generalB];
          this.logs.push(
            `🥁 Chiêng đồng vang rền! ${genASpec.vnName} đơn thương độc mã mở vòng Đơn Đấu sinh tử cùng ${genBSpec.vnName}!`,
          );
          this.dirty = true;
          this.tryEmitDuelStartBanter(duelRes.duel);
          return undefined;
        }

        // Trường hợp khoảng cách trung bình (420 < dist <= 900): `tryStartGeneralDuel` đã ra lệnh
        // cho Danh tướng thúc chiến mã áp sát mục tiêu để tự mở Đơn Đấu khi vào tầm <= 220!
        if (hasPendingDuelChallenge(challenger)) {
          if (duelRes.reason && !side.bot) {
            this.logs.push(`🐎 ${duelRes.reason}`);
            this.dirty = true;
          }
          return undefined;
        }

        return side.bot ? undefined : duelRes.reason;
      }

      default:
        return 'Lệnh điều binh không xác định.';
    }
  }

  private getControllableOwnedRegs(
    ownerIdx: number,
    rawIds: unknown,
  ): TwSimRegiment[] {
    if (!Array.isArray(rawIds) || rawIds.length === 0) return [];
    const seen = new Set<number>();
    const out: TwSimRegiment[] = [];
    const limit = Math.min(rawIds.length, 32);

    for (let i = 0; i < limit; i++) {
      const id = Math.floor(Number(rawIds[i]));
      if (!Number.isFinite(id) || seen.has(id)) continue;
      seen.add(id);

      const reg = this.regsById.get(id);
      if (
        !reg ||
        reg.ownerIdx !== ownerIdx ||
        !isFightingReg(reg) ||
        reg.duelId !== undefined
      ) {
        continue;
      }
      out.push(reg);
    }
    return out;
  }

  // ==========================================================================
  // 3. CHU TRÌNH MÔ PHỎNG CHIẾN TRƯỜNG 15 HZ (`step`)
  // ==========================================================================

  step(): void {
    if (this.result) return;

    this.tickNo++;
    this.invalidateFrameCaches();

    const sfxOut = new Set<TwSfxEvent>();
    for (const sfx of this.pendingCommandSfx) {
      sfxOut.add(sfx);
    }
    this.pendingCommandSfx.clear();

    // Xử lý Pha Bố Trận Tiền Chiến (`battlePhase === 'deployment'`): không trừ đồng hồ trận chiến,
    // cho phép người chơi & AI sắp đội hình / gài bẫy rừng thông trước khi Khai Chiến!
    if (this.battlePhase === 'deployment') {
      for (let i = 0; i < this.sides.length; i++) {
        const s = this.sides[i];
        if (!s.alive) continue;
        s.tokens = Math.min(TW_CMD_BURST, s.tokens + TW_CMD_REFILL * DT_SEC);
      }

      for (let i = 0; i < this.sides.length; i++) {
        const s = this.sides[i];
        if (!s.bot || !s.alive || s.readyDeploy) continue;
        stepTwBotSide(
          s.idx,
          s.team,
          this.map,
          this.regiments,
          this.captures,
          this.tickNo,
          (botCmd) => {
            this.command(s.idx, botCmd);
          },
          {
            romanceMode: this.config.romanceMode,
            botDifficulty: this.config.botDifficulty,
            battlePhase: 'deployment',
            deployZone: this.deployZones[s.idx],
            deployablesLeft: s.deployablesLeft,
            readyDeploy: s.readyDeploy,
            deployables: this.deployables,
            fires: this.fires,
          },
        );
      }
      if (this.pendingCommandSfx.size > 0) {
        for (const sfx of this.pendingCommandSfx) {
          sfxOut.add(sfx);
        }
        this.pendingCommandSfx.clear();
      }

      if ((this.battlePhase as TwBattlePhase) === 'deployment') {
        this.deploymentLeftSec = Math.max(
          0,
          Math.round((this.deploymentLeftSec - DT_SEC) * 100) / 100,
        );
        if (this.deploymentLeftSec <= 0 || this.areAllReadyForBattle()) {
          this.startBattleFromDeployment(sfxOut);
        }
      }

      this.recomputeSummariesAndPower();
      this.invalidateFrameCaches();
      this.lastSfxEvents = Array.from(sfxOut);
      if (this.dirty || this.logs.length > 0) {
        this.dirty = false;
        this.onChangedCallback?.();
      }
      this.onTickCallback();
      return;
    }

    this.elapsed += TW_TICK_MS;

    // Cập nhật hướng gió & cường độ gió tự nhiên (gió Đông Nam tại Xích Bích, gió thu nhẹ các chiến trường khác)
    const baseWind = this.map.id === 'chibi' ? Math.PI * 1.25 : 0.38;
    const baseStrength = this.map.id === 'chibi' ? 0.82 : 0.58;
    this.windAngle = normalizeAngle(
      baseWind + Math.sin(this.tickNo * 0.008) * 0.18,
    );
    this.windStrength =
      Math.round(
        clamp(baseStrength + Math.sin(this.tickNo * 0.013) * 0.12, 0.35, 0.98) *
          100,
      ) / 100;

    // Tù và & trống trận khai cuộc ở nhịp đầu tiên; Đối thoại Danh Tướng mở màn tại tick = 5 (hoặc 5 nhịp sau Khai Chiến)
    if (this.tickNo === 1 && !this.config.deploymentPhase) {
      sfxOut.add('horn');
      sfxOut.add('drums');
    }
    if (
      !this.openingBanterEmitted &&
      this.tickNo >= this.battleStartTick + OPENING_BANTER_TICK
    ) {
      this.openingBanterEmitted = true;
      this.emitOpeningBanter();
    }

    // 1. Hồi ngân sách lệnh cho từng chư hầu & cập nhật bộ đếm hồi chiêu / hiệu ứng Tuyệt Kỹ
    for (let i = 0; i < this.sides.length; i++) {
      const s = this.sides[i];
      if (!s.alive) continue;
      s.tokens = Math.min(TW_CMD_BURST, s.tokens + TW_CMD_REFILL * DT_SEC);
    }

    for (let i = 0; i < this.regiments.length; i++) {
      const reg = this.regiments[i];
      if (!isAliveReg(reg)) continue;

      if (reg.skillCooldownLeft > 0) {
        reg.skillCooldownLeft = Math.max(
          0,
          Math.round((reg.skillCooldownLeft - DT_SEC) * 100) / 100,
        );
      }
      if (reg.activeBuffLeftSec > 0) {
        reg.activeBuffLeftSec = Math.max(0, reg.activeBuffLeftSec - DT_SEC);
        if (reg.activeBuffLeftSec <= 0) {
          reg.activeBuff = undefined;
        }
      }
    }

    // 2. Trí Tuệ Nhân Tạo Chư Hầu (`stepTwBotSide`)
    for (let i = 0; i < this.sides.length; i++) {
      const s = this.sides[i];
      if (!s.bot || !s.alive) continue;
      stepTwBotSide(
        s.idx,
        s.team,
        this.map,
        this.regiments,
        this.captures,
        this.tickNo,
        (botCmd) => {
          this.command(s.idx, botCmd);
        },
        {
          romanceMode: this.config.romanceMode,
          botDifficulty: this.config.botDifficulty,
          battlePhase: this.battlePhase,
          deployZone: this.deployZones[s.idx],
          fires: this.fires,
          deployables: this.deployables,
          duels: this.duels,
          deployablesLeft: s.deployablesLeft,
          readyDeploy: s.readyDeploy,
        },
      );
    }
    if (this.pendingCommandSfx.size > 0) {
      for (const sfx of this.pendingCommandSfx) {
        sfxOut.add(sfx);
      }
      this.pendingCommandSfx.clear();
    }

    // 2.5. Mô phỏng Đạo Cụ Chiến Trường (`stakes`, `caltrops`, `oil`) & Hỏa Công Cháy Rừng Lan Theo Gió (`fires`)
    const fortStep = stepFieldFortificationsAndFires(
      this.map,
      this.regiments,
      this.deployables,
      this.fires,
      this.windAngle,
      this.windStrength,
      () => ++this.fireSeq,
      DT_SEC,
      sfxOut,
    );
    if (fortStep.logs.length > 0) {
      for (let i = 0; i < fortStep.logs.length; i++) {
        this.logs.push(fortStep.logs[i]);
      }
      this.dirty = true;
    }

    // Tổng hợp vật cản nguy hiểm cho điều hướng Yuka (`Arrive` + `ObstacleAvoidance`)
    const hazards: TwSteeringHazard[] = [];
    for (let i = 0; i < this.fires.length; i++) {
      const f = this.fires[i];
      hazards.push({ x: f.x, y: f.y, radius: f.radius, kind: 'fire' });
    }
    for (let i = 0; i < this.deployables.length; i++) {
      const d = this.deployables[i];
      if (d.kind === 'stakes' && d.hp > 0) {
        hazards.push({
          x: d.x,
          y: d.y,
          radius: d.radius,
          kind: 'stakes',
          team: d.team,
        });
      }
    }

    // 3. Lấy mẫu Địa hình & Di chuyển / Xoay cánh / Xung kích / Thể lực (`sampleTerrainAt` + `stepRegimentMovement`)
    for (let i = 0; i < this.regiments.length; i++) {
      const reg = this.regiments[i];
      if (isAliveReg(reg)) {
        const preTerr = sampleTerrainAt(this.map, reg.x, reg.y);
        reg.inForest = preTerr.inForest;
        reg.onHighGround = preTerr.onHighGround;
        reg.inRiver = preTerr.inRiver;
        reg.inMud = preTerr.inMud;

        stepRegimentMovement(
          reg,
          this.regiments,
          preTerr.speedMul,
          this.W,
          this.H,
          DT_SEC,
          hazards,
        );

        const postTerr = sampleTerrainAt(this.map, reg.x, reg.y);
        reg.inForest = postTerr.inForest;
        reg.onHighGround = postTerr.onHighGround;
        reg.inRiver = postTerr.inRiver;
        reg.inMud = postTerr.inMud;
      } else {
        stepRegimentMovement(
          reg,
          this.regiments,
          1.0,
          this.W,
          this.H,
          DT_SEC,
          hazards,
        );
      }
    }

    // 4. Mô phỏng Đơn Đấu Danh Tướng 1v1 (`stepGeneralDuels`)
    const prevDuelIds = new Set<number>();
    for (let i = 0; i < this.duels.length; i++) {
      prevDuelIds.add(this.duels[i].id);
    }

    const duelStep = stepGeneralDuels(
      this.duels,
      this.regsById,
      this.regiments,
      DT_SEC,
      sfxOut,
    );
    if (duelStep.logs.length > 0) {
      for (let i = 0; i < duelStep.logs.length; i++) {
        this.logs.push(duelStep.logs[i]);
      }
      this.dirty = true;
    }

    // Nếu thế lực Lữ Bố hạ gục tướng địch trong Đơn Đấu, thưởng thêm nhuệ khí chiến thần cho toàn quân
    if (duelStep.duelWinners.length > 0) {
      for (let i = 0; i < duelStep.duelWinners.length; i++) {
        const { winner } = duelStep.duelWinners[i];
        const winSide = this.sides[winner.ownerIdx];
        if (winSide && winSide.faction === 'lubu') {
          for (let r = 0; r < this.regiments.length; r++) {
            const ally = this.regiments[r];
            if (ally.ownerIdx === winSide.idx && isAliveReg(ally)) {
              ally.morale = clamp(ally.morale + 12, 0, 100);
            }
          }
        }
      }
    }

    let newlyAutoStartedDuel: TwActiveDuel | undefined;
    for (let i = 0; i < this.duels.length; i++) {
      if (!prevDuelIds.has(this.duels[i].id)) {
        newlyAutoStartedDuel = this.duels[i];
        break;
      }
    }

    // 5. Giao chiến Cận chiến, Xung kích, Chèn khối Kỵ binh & Phản xung kích Thương Lâm (`stepMeleeAndCharges`)
    const { majorChargeEvents } = stepMeleeAndCharges(
      this.regiments,
      DT_SEC,
      sfxOut,
    );

    // 6. Xạ kích Cung Nỏ / Tên Lửa, Pháo Đá Uy Viễn & Tiến triển Đạn đạo theo Gió (`stepRangedAndProjectiles`)
    stepRangedAndProjectiles(
      this.regiments,
      this.projectiles,
      () => ++this.projSeq,
      DT_SEC,
      sfxOut,
      {
        windAngle: this.windAngle,
        windStrength: this.windStrength,
        onFireImpact: (ix, iy, ownerIdx, team, radius) => {
          tryIgniteWildfireAt(
            this.map,
            this.fires,
            this.deployables,
            ix,
            iy,
            radius,
            ownerIdx,
            team,
            () => ++this.fireSeq,
            false,
            sfxOut,
          );
        },
        onBoulderImpact: (ix, iy, _ownerIdx, team) => {
          suppressBastionTowerAt(this.map, this.captures, ix, iy, team);
        },
      },
    );

    // 6.5. Tháp Tiễn Thành Lũy tự động khai hỏa bảo vệ Đài Hiệu Lệnh đã chiếm (`stepBastionWatchtowers`)
    stepBastionWatchtowers(
      this.map,
      this.captures,
      this.regiments,
      (x0, y0, target, ownerTeam) => {
        const ownerSide =
          this.sides.find((s) => s.team === ownerTeam && s.alive) ??
          this.sides.find((s) => s.team === ownerTeam);
        spawnBastionTowerProjectile(
          this.projectiles,
          () => ++this.projSeq,
          x0,
          y0,
          target,
          ownerTeam,
          ownerSide?.idx ?? 0,
          sfxOut,
        );
      },
      DT_SEC,
    );

    // 6.8. Kiểm tra Duyên Phận Quan Hệ (Guanxi) khi có Danh Tướng ngã xuống nơi sa trường
    for (let i = 0; i < this.regiments.length; i++) {
      const reg = this.regiments[i];
      if (!reg.isGeneral || isAliveReg(reg)) continue;
      if (this.slainGeneralIds.has(reg.id)) continue;
      this.slainGeneralIds.add(reg.id);
      const guanxiLogs = triggerGuanxiOnGeneralDeath(
        reg,
        this.regiments,
        sfxOut,
      );
      if (guanxiLogs.length > 0) {
        for (let g = 0; g < guanxiLogs.length; g++) {
          this.logs.push(guanxiLogs[g]);
        }
        this.dirty = true;
      }
    }

    // 7. Hào quang Ngũ Hành Danh Tướng, Cấp Bậc Tinh Nhuệ & Máy trạng thái Sĩ khí (`stepMoraleAndAuras`)
    const wasRoutingIds = new Set<number>();
    for (let i = 0; i < this.regiments.length; i++) {
      const reg = this.regiments[i];
      if (
        reg.moraleState === 'routing' ||
        reg.moraleState === 'shattered'
      ) {
        wasRoutingIds.add(reg.id);
      }
    }

    stepMoraleAndAuras(this.regiments, DT_SEC, sfxOut);

    // 8. Ẩn quân Phục kích trong Rừng Thông (`isRegimentHidden`) & Phát hiện Phục binh lộ diện
    const aliveSpotters = this.regiments.filter(isAliveReg);
    let ambushRevealedPair:
      | { ambusher: TwSimRegiment; victim: TwSimRegiment }
      | undefined;
    const ambushTriggerSq = (TW_FOREST_SPOT_RADIUS + 45) * (TW_FOREST_SPOT_RADIUS + 45);

    for (let i = 0; i < this.regiments.length; i++) {
      const reg = this.regiments[i];
      const wasHidden = reg.hidden;
      if (!isAliveReg(reg)) {
        reg.hidden = false;
        continue;
      }

      const nowHidden = isRegimentHidden(reg, aliveSpotters, reg.team);
      reg.hidden = nowHidden;

      if (!wasHidden && nowHidden) {
        for (let k = 0; k < this.regiments.length; k++) {
          const foe = this.regiments[k];
          if (foe.team !== reg.team && foe.lockedTargetId === reg.id) {
            foe.lockedTargetId = undefined;
            foe.chargeTicks = 0;
          }
        }
      }

      if (
        !ambushRevealedPair &&
        wasHidden &&
        !nowHidden &&
        reg.inForest &&
        reg.moraleState !== 'routing' &&
        reg.moraleState !== 'shattered'
      ) {
        for (let j = 0; j < aliveSpotters.length; j++) {
          const foe = aliveSpotters[j];
          if (foe.team === reg.team) continue;
          const dx = foe.x - reg.x;
          const dy = foe.y - reg.y;
          if (dx * dx + dy * dy <= ambushTriggerSq) {
            ambushRevealedPair = { ambusher: reg, victim: foe };
            break;
          }
        }
      }
    }

    // 9. Tranh chấp & Chiếm giữ Đài Hiệu Lệnh Chiến Lược (`stepCapturePoints`)
    const prevCaptureOwners = this.captures.map((c) => c.ownerTeam);
    stepCapturePoints(this.map, this.captures, this.regiments, DT_SEC);

    for (let i = 0; i < this.captures.length; i++) {
      const cap = this.captures[i];
      if (cap.ownerTeam !== -1 && cap.ownerTeam !== prevCaptureOwners[i]) {
        const cpSpec = this.map.capturePoints.find((p) => p.id === cap.id);
        const pointName = cpSpec ? cpSpec.name : `Đài Hiệu Lệnh #${cap.id + 1}`;
        this.logs.push(
          `🚩 ${this.teamName(cap.ownerTeam)} đã cắm đại kỳ khống chế 【${pointName}】!`,
        );
        sfxOut.add('horn');
        this.dirty = true;
      }
    }

    // 10. Đối thoại Danh Tướng động trên chiến trường (tối đa 1 lần mỗi 18 giây)
    this.pruneExpiredBanters();
    this.stepDynamicBanters(
      newlyAutoStartedDuel,
      ambushRevealedPair,
      majorChargeEvents,
      wasRoutingIds,
    );

    // 11. Kiểm kê Quân số, Loại phe Toàn quân tan vỡ & Kiểm tra Điều kiện Chiến thắng
    this.recomputeSummariesAndPower();
    this.checkSideEliminations(sfxOut);
    this.recomputeSummariesAndPower();
    this.checkVictoryConditions(sfxOut);

    this.lastSfxEvents = Array.from(sfxOut);

    if (this.dirty || this.logs.length > 0) {
      this.dirty = false;
      this.onChangedCallback?.();
    }
    this.onTickCallback();
  }

  // ==========================================================================
  // 4. HỆ THỐNG ĐỐI THOẠI DANH TƯỚNG ĐIỆN ẢNH (`TwBanterEvent`)
  // ==========================================================================

  private pruneExpiredBanters(): void {
    if (this.banters.length === 0) return;
    this.banters = this.banters.filter(
      (b) => this.tickNo - b.atTick <= BANTER_DISPLAY_TICKS,
    );
  }

  private findLeadGeneralForSide(sideIdx: number): TwGeneralId {
    const side = this.sides[sideIdx];
    if (!side) return 'cao_cao';

    // Ưu tiên Danh Tướng còn sống của phe đó; nếu đã ngã xuống hết vẫn lấy Chủ tướng đại diện
    for (let i = 0; i < this.regiments.length; i++) {
      const r = this.regiments[i];
      if (r.ownerIdx === sideIdx && r.isGeneral && r.generalId && isAliveReg(r)) {
        return r.generalId;
      }
    }
    return side.generals[0];
  }

  private pushBanterEvent(
    leftGeneral: TwGeneralId,
    leftOwnerIdx: number,
    leftLine: string,
    rightGeneral: TwGeneralId,
    rightOwnerIdx: number,
    rightLine: string,
    ignoreCooldown = false,
  ): void {
    if (
      !ignoreCooldown &&
      this.tickNo - this.lastBanterTick < BANTER_COOLDOWN_TICKS
    ) {
      return;
    }

    const ev: TwBanterEvent = {
      id: ++this.banterSeq,
      leftGeneral,
      leftOwnerIdx,
      leftLine,
      rightGeneral,
      rightOwnerIdx,
      rightLine,
      atTick: this.tickNo,
    };

    // Giữ duy nhất đối thoại mới nhất đang hoạt động để giao diện hiển thị gọn, điện ảnh
    this.banters = [ev];
    this.lastBanterTick = this.tickNo;
  }

  private emitOpeningBanter(): void {
    if (this.sides.length < 2) return;

    // Ưu tiên cặp đối thủ biểu tượng `sima_xiangan` vs `yuan_shao` nếu hiện diện ở hai Liên Minh đối lập
    let sideA = this.sides[0];
    let sideB = this.sides.find((s) => s.team !== sideA.team) ?? this.sides[1];
    let genA = sideA.generals[0];
    let genB = sideB.generals[0];

    for (let i = 0; i < this.sides.length; i++) {
      for (let j = i + 1; j < this.sides.length; j++) {
        const s1 = this.sides[i];
        const s2 = this.sides[j];
        if (s1.team === s2.team) continue;

        const s1HasSima = s1.generals.includes('sima_xiangan');
        const s2HasYuan = s2.generals.includes('yuan_shao');
        if (s1HasSima && s2HasYuan) {
          sideA = s1;
          sideB = s2;
          genA = 'sima_xiangan';
          genB = 'yuan_shao';
          break;
        }

        const s1HasYuan = s1.generals.includes('yuan_shao');
        const s2HasSima = s2.generals.includes('sima_xiangan');
        if (s1HasYuan && s2HasSima) {
          sideA = s1;
          sideB = s2;
          genA = 'yuan_shao';
          genB = 'sima_xiangan';
          break;
        }
      }
    }

    const { leftLine, rightLine } = getOpeningBanterLines(genA, genB);
    this.pushBanterEvent(
      genA,
      sideA.idx,
      leftLine,
      genB,
      sideB.idx,
      rightLine,
      true,
    );
  }

  private tryEmitDuelStartBanter(duel: TwActiveDuel): void {
    const specA = TW_GENERALS[duel.generalA];
    const specB = TW_GENERALS[duel.generalB];
    const leftLine =
      duel.generalA === 'lu_bu'
        ? `${specB.vnName}! Đỡ lấy một chiêu Phương Thiên Họa Kích của bản hầu đây!`
        : duel.generalA === 'guan_yu'
          ? `Quan Vân Trường xin lĩnh giáo cao chiêu của ${specB.vnName} giữa vạn quân!`
          : duel.generalA === 'zhang_fei'
            ? `${specB.vnName}! Mau thúc ngựa ra đây đọ sức với Bát Xà Mâu của Trương gia!`
            : `${specB.vnName}! Ngươi có dám cùng ${specA.vnName} quyết phân cao thấp trước ba quân chăng?!`;

    const rightLine =
      duel.generalB === 'lu_bu'
        ? 'Muốn tìm cái chết dưới chân Xích Thố thì cứ xông vào!'
        : duel.generalB === 'zhao_yun'
          ? 'Thương pháp Thường Sơn chưa từng ngán bậc hào kiệt nào — xin mời xuất chiêu!'
          : `Hừ! Đao thương không có mắt, hôm nay ${specB.vnName} quyết chẳng nương tay!`;

    this.pushBanterEvent(
      duel.generalA,
      duel.ownerA,
      leftLine,
      duel.generalB,
      duel.ownerB,
      rightLine,
      false,
    );
  }

  private stepDynamicBanters(
    newlyStartedDuel: TwActiveDuel | undefined,
    ambushRevealedPair:
      | { ambusher: TwSimRegiment; victim: TwSimRegiment }
      | undefined,
    majorChargeEvents: { attacker: TwSimRegiment; defender: TwSimRegiment }[],
    wasRoutingIds: Set<number>,
  ): void {
    if (
      this.tickNo <= OPENING_BANTER_TICK ||
      this.tickNo - this.lastBanterTick < BANTER_COOLDOWN_TICKS
    ) {
      return;
    }

    // Ưu tiên 1: Đơn Đấu Danh Tướng vừa khai cuộc
    if (newlyStartedDuel) {
      this.tryEmitDuelStartBanter(newlyStartedDuel);
      return;
    }

    // Ưu tiên 2: Phục binh từ Rừng Thông bất ngờ lộ diện tập kích quân địch
    if (ambushRevealedPair) {
      const { ambusher, victim } = ambushRevealedPair;
      const ambGen = ambusher.generalId ?? this.findLeadGeneralForSide(ambusher.ownerIdx);
      const vicGen = victim.generalId ?? this.findLeadGeneralForSide(victim.ownerIdx);
      this.pushBanterEvent(
        ambGen,
        ambusher.ownerIdx,
        'Phục binh trong rừng thông nghe lệnh — nổi chiêng giương cung, đánh úp sườn giặc!',
        vicGen,
        victim.ownerIdx,
        'Nguy rồi, trong rừng có phục binh! Ba quân khép chặt hàng ngũ, chớ để rối loạn!',
      );
      return;
    }

    // Ưu tiên 3: Kỵ binh xung kích dữ dội hoặc Thương Lâm phản xung kích
    if (majorChargeEvents.length > 0) {
      const ev = majorChargeEvents[0];
      const atkGen =
        ev.attacker.generalId ?? this.findLeadGeneralForSide(ev.attacker.ownerIdx);
      const defGen =
        ev.defender.generalId ?? this.findLeadGeneralForSide(ev.defender.ownerIdx);
      const spearReflected =
        ev.defender.bracedTicks >= 8 &&
        (ev.defender.formation === 'spearwall' ||
          (!ev.defender.isGeneral && TW_UNITS[ev.defender.kind].antiCavalryBonus >= 20)) &&
        !ev.attacker.isGeneral &&
        (TW_UNITS[ev.attacker.kind].category === 'cavalry_shock' ||
          TW_UNITS[ev.attacker.kind].category === 'cavalry_melee');

      if (spearReflected) {
        this.pushBanterEvent(
          defGen,
          ev.defender.ownerIdx,
          'Thương Lâm vững tựa tường đồng! Kỵ binh giặc tự lao đầu vào rừng giáo nhọn!',
          atkGen,
          ev.attacker.ownerIdx,
          'Đáng giận! Tuyến trường thương của chúng ghìm quá chặt, kỵ binh mau rút đà chuyển hướng!',
        );
      } else {
        this.pushBanterEvent(
          atkGen,
          ev.attacker.ownerIdx,
          'Nổi trống xung phong! Theo mũi giáo của ta đâm thủng trung quân địch!',
          defGen,
          ev.defender.ownerIdx,
          'Giữ vững khiên thuẫn, tấc đất không nhường — quyết bẻ gãy đợt xung kích này!',
        );
      }
      return;
    }

    // Ưu tiên 4: Vỡ trận dây chuyền (Mass Rout >= 3 trung đoàn của một chư hầu cùng tháo chạy)
    for (let sIdx = 0; sIdx < this.sides.length; sIdx++) {
      const side = this.sides[sIdx];
      if (!side.alive) continue;

      let routingCount = 0;
      let freshRoutThisTick = false;
      for (let r = 0; r < this.regiments.length; r++) {
        const reg = this.regiments[r];
        if (reg.ownerIdx !== side.idx || !isAliveReg(reg)) continue;
        if (reg.moraleState === 'routing' || reg.moraleState === 'shattered') {
          routingCount++;
          if (!wasRoutingIds.has(reg.id)) {
            freshRoutThisTick = true;
          }
        }
      }

      if (freshRoutThisTick && routingCount >= 3) {
        const enemySide = this.sides.find((o) => o.alive && o.team !== side.team);
        if (enemySide) {
          const winGen = this.findLeadGeneralForSide(enemySide.idx);
          const loseGen = this.findLeadGeneralForSide(side.idx);
          this.pushBanterEvent(
            winGen,
            enemySide.idx,
            'Sĩ khí quân giặc đã sụp đổ! Toàn quân thừa thắng xông lên truy kích!',
            loseGen,
            side.idx,
            'Đứng lại giữ trận! Kẻ nào tự ý quay đầu bỏ chạy sẽ bị xử theo quân pháp!',
          );
          return;
        }
      }
    }
  }

  // ==========================================================================
  // 5. TÍNH CÁN CÂN QUÂN LỰC (`balanceOfPower`), LOẠI PHE & CHIẾN THẮNG
  // ==========================================================================

  private recomputeSummariesAndPower(): void {
    const sideCount = this.sides.length;
    const menByOwner = new Array<number>(sideCount).fill(0);
    const aliveRegsByOwner = new Array<number>(sideCount).fill(0);
    const killsByOwner = new Array<number>(sideCount).fill(0);
    const combatPowerByOwner = new Array<number>(sideCount).fill(0);

    let maxTeamIdx =
      this.config.mode === 'historical_2teams' ? 1 : Math.max(1, sideCount - 1);
    for (let i = 0; i < sideCount; i++) {
      if (this.sides[i].team > maxTeamIdx) {
        maxTeamIdx = this.sides[i].team;
      }
    }
    const teamPower = new Array<number>(maxTeamIdx + 1).fill(0);

    for (let i = 0; i < this.regiments.length; i++) {
      const reg = this.regiments[i];
      const oIdx = reg.ownerIdx;
      if (oIdx < 0 || oIdx >= sideCount) continue;

      killsByOwner[oIdx] += reg.kills;

      if (!isAliveReg(reg)) continue;

      menByOwner[oIdx] += reg.men;
      if (reg.moraleState !== 'shattered') {
        aliveRegsByOwner[oIdx] += 1;
      }

      // Trọng số sức mạnh chiến đấu thực tế của trung đoàn: kết hợp Máu còn lại, Sĩ khí & Võ lực Danh tướng
      const regPower = this.computeRegimentCombatPower(reg);
      combatPowerByOwner[oIdx] += regPower;
      if (this.sides[oIdx].alive && reg.team >= 0 && reg.team < teamPower.length) {
        teamPower[reg.team] += regPower;
      }
    }

    // Đếm Đài Hiệu Lệnh đang sở hữu của từng Liên Minh để cộng điểm chiến lược
    const capturedByTeam = new Map<number, number>();
    for (let i = 0; i < this.captures.length; i++) {
      const c = this.captures[i];
      if (c.ownerTeam >= 0 && c.progress >= 100) {
        capturedByTeam.set(c.ownerTeam, (capturedByTeam.get(c.ownerTeam) ?? 0) + 1);
      }
    }

    const summaries: TwSideSummary[] = new Array(sideCount);
    for (let i = 0; i < sideCount; i++) {
      const s = this.sides[i];
      s.totalMen = menByOwner[i];
      s.regimentsAlive = aliveRegsByOwner[i];
      s.kills = killsByOwner[i];

      const heldCaps = s.alive ? capturedByTeam.get(s.team) ?? 0 : 0;
      s.score = Math.round(
        s.kills * 2.5 +
          (s.alive ? combatPowerByOwner[i] * 0.045 : 0) +
          heldCaps * 220,
      );

      summaries[i] = {
        idx: s.idx,
        id: s.id,
        name: s.name,
        bot: s.bot,
        faction: s.faction,
        team: s.team,
        color: s.color,
        alive: s.alive,
        readyDeploy: s.readyDeploy,
        deployablesLeft: { ...s.deployablesLeft },
        totalMen: s.totalMen,
        initialMen: s.initialMen,
        regimentsAlive: s.regimentsAlive,
        kills: s.kills,
        score: s.score,
      };
    }
    this.sideSummaryCache = summaries;

    // Chuẩn hóa mảng `balanceOfPower` sao cho tổng các Liên Minh luôn bằng đúng 1.0
    const totalPower = teamPower.reduce((acc, v) => acc + v, 0);
    if (totalPower <= 1e-6) {
      const uniform = Math.round((1 / teamPower.length) * 10000) / 10000;
      this.balanceOfPowerCache = teamPower.map((_, idx) =>
        idx === teamPower.length - 1
          ? Math.max(0, Math.round((1 - uniform * (teamPower.length - 1)) * 10000) / 10000)
          : uniform,
      );
    } else {
      const normalized = teamPower.map(
        (p) => Math.round((p / totalPower) * 10000) / 10000,
      );
      let maxIdx = 0;
      for (let i = 1; i < normalized.length; i++) {
        if (teamPower[i] > teamPower[maxIdx]) maxIdx = i;
      }
      const sumOthers = normalized.reduce(
        (acc, v, idx) => (idx === maxIdx ? acc : acc + v),
        0,
      );
      normalized[maxIdx] = Math.max(
        0,
        Math.round((1 - sumOthers) * 10000) / 10000,
      );
      this.balanceOfPowerCache = normalized;
    }

    // Dựng sẵn khung Đạn đạo, Đơn Đấu & Biển Lửa dùng chung cho mọi người xem trong nhịp hiện tại
    this.projectileFramesCache = this.projectiles.map(toProjectileFrame);
    this.duelFramesCache = this.duels.map(toDuelFrame);
    this.fireFramesCache = this.fires.map((f) => ({
      id: f.id,
      x: round1(f.x),
      y: round1(f.y),
      radius: round1(f.radius),
      intensity: Math.round(clamp(f.intensity, 0, 1) * 100) / 100,
      leftSec: round1(f.leftSec),
      ownerIdx: f.ownerIdx,
    }));
  }

  private computeRegimentCombatPower(reg: TwSimRegiment): number {
    if (!isAliveReg(reg) || reg.moraleState === 'shattered') return 0;

    const stateMul =
      reg.moraleState === 'eager'
        ? 1.15
        : reg.moraleState === 'steady'
          ? 1.0
          : reg.moraleState === 'wavering'
            ? 0.72
            : 0.2;
    const moraleFactor = stateMul * (0.65 + clamp(reg.morale, 0, 100) * 0.005);

    if (reg.isGeneral && reg.generalId && TW_GENERALS[reg.generalId]) {
      const g = TW_GENERALS[reg.generalId];
      const hpRatio = clamp(reg.hp / Math.max(1, reg.maxHp), 0, 1);
      const heroMartial =
        (g.duelPower * 15 + g.meleeAtk * 11 + g.meleeDef * 9 + g.armor * 5) *
        (0.4 + 0.6 * hpRatio);
      return (reg.hp * 1.55 + heroMartial) * moraleFactor;
    }

    const u = TW_UNITS[reg.kind];
    const qualityMul =
      0.75 +
      (u.meleeAtk +
        u.meleeDef +
        u.armor * 0.5 +
        u.missileDmg * 0.85 +
        u.armorPiercingDmg * 1.15 +
        u.chargeBonus * 0.35) /
        140;
    const ammoMul = u.maxAmmo > 0 && reg.ammo <= 0 ? 0.45 : 1.0;

    return reg.hp * qualityMul * ammoMul * moraleFactor;
  }

  /**
   * Kiểm tra điều kiện bại trận của từng chư hầu:
   * Khi toàn bộ trung đoàn của một chư hầu đều đã tử trận HOẶC đồng loạt tháo chạy (`'routing'` / `'shattered'`),
   * đại quân của chư hầu đó chính thức sụp đổ ("Toàn quân tan vỡ!").
   */
  private checkSideEliminations(sfxOut: Set<TwSfxEvent>): void {
    for (let sIdx = 0; sIdx < this.sides.length; sIdx++) {
      const side = this.sides[sIdx];
      if (!side.alive) continue;

      let fightingRegs = 0;
      for (let r = 0; r < this.regiments.length; r++) {
        const reg = this.regiments[r];
        if (reg.ownerIdx === side.idx && isFightingReg(reg)) {
          fightingRegs++;
          break;
        }
      }

      if (fightingRegs > 0) continue;

      side.alive = false;

      // Dọn dẹp Đơn Đấu nếu có tướng vừa gãy sĩ khí và chuyển toàn bộ quân đang tháo chạy sang tan rã vĩnh viễn
      for (let i = this.duels.length - 1; i >= 0; i--) {
        const duel = this.duels[i];
        const genA = this.regsById.get(duel.genARegId);
        const genB = this.regsById.get(duel.genBRegId);
        if (genA?.ownerIdx === side.idx || genB?.ownerIdx === side.idx) {
          if (genA) {
            genA.duelId = undefined;
            if (genA.ownerIdx !== side.idx && isAliveReg(genA)) genA.anim = 'idle';
          }
          if (genB) {
            genB.duelId = undefined;
            if (genB.ownerIdx !== side.idx && isAliveReg(genB)) genB.anim = 'idle';
          }
          this.duels.splice(i, 1);
        }
      }

      for (let r = 0; r < this.regiments.length; r++) {
        const reg = this.regiments[r];
        if (reg.ownerIdx !== side.idx || !isAliveReg(reg)) continue;
        reg.morale = 0;
        reg.moraleState = 'shattered';
        reg.anim = 'rout';
      }

      sfxOut.add('rout');
      sfxOut.add('horn');
      this.logs.push(
        `💥 Toàn quân tan vỡ! Đại quân của ${side.name} (${TW_FACTIONS[side.faction].vnName}) đã hoàn toàn sụp đổ trên chiến trường!`,
      );
      this.dirty = true;
    }
  }

  private checkVictoryConditions(sfxOut: Set<TwSfxEvent>): void {
    if (this.result) return;

    const aliveTeams = Array.from(
      new Set(this.sides.filter((s) => s.alive).map((s) => s.team)),
    );

    // 1. Theo dõi thời gian nắm giữ >= 2/3 Đài Hiệu Lệnh ở mức 100% liên tục trong 45 giây
    const fullCapsByTeam = new Map<number, number>();
    for (let i = 0; i < this.captures.length; i++) {
      const cap = this.captures[i];
      if (cap.ownerTeam >= 0 && cap.progress >= 99.99) {
        fullCapsByTeam.set(
          cap.ownerTeam,
          (fullCapsByTeam.get(cap.ownerTeam) ?? 0) + 1,
        );
      }
    }

    let captureWinnerTeam = -1;
    const knownTeams = new Set<number>([
      ...this.sides.map((s) => s.team),
      ...this.captureHoldTicksByTeam.keys(),
    ]);

    for (const team of knownTeams) {
      const isTeamAlive = aliveTeams.includes(team);
      const heldFull = isTeamAlive ? fullCapsByTeam.get(team) ?? 0 : 0;

      if (heldFull >= CAPTURE_VICTORY_MIN_POINTS) {
        const nextHoldTicks = (this.captureHoldTicksByTeam.get(team) ?? 0) + 1;
        this.captureHoldTicksByTeam.set(team, nextHoldTicks);

        if (
          nextHoldTicks >= CAPTURE_VICTORY_WARN_TICKS &&
          !this.captureWarned20SecTeams.has(team)
        ) {
          this.captureWarned20SecTeams.add(team);
          this.logs.push(
            `⏳ ${this.teamName(team)} đã giữ vững ${heldFull}/${this.captures.length} Đài Hiệu Lệnh — chỉ còn 20 giây sẽ định đoạt đại cục!`,
          );
          sfxOut.add('drums');
          this.dirty = true;
        }

        if (
          nextHoldTicks >= CAPTURE_VICTORY_HOLD_TICKS &&
          captureWinnerTeam === -1
        ) {
          captureWinnerTeam = team;
        }
      } else {
        this.captureHoldTicksByTeam.set(team, 0);
        this.captureWarned20SecTeams.delete(team);
      }
    }

    const maxDurationMs = this.config.durationMin * 60_000;
    const timeExpired = this.elapsed >= maxDurationMs || Date.now() >= this.endsAt;

    let winnerTeam = -1;
    let reason = '';

    if (aliveTeams.length <= 1) {
      winnerTeam = aliveTeams[0] ?? this.pickBestTiebreakTeam(this.sides.map((s) => s.team));
      reason =
        aliveTeams.length === 1
          ? `${this.teamName(winnerTeam)} đã quét sạch mọi đạo quân đối địch — Nhất Thống Chiến Trường!`
          : 'Lưỡng bại câu thương — phân định thắng cuộc theo chiến công còn lại trên sa trường!';
    } else if (captureWinnerTeam >= 0) {
      winnerTeam = captureWinnerTeam;
      const heldCount = fullCapsByTeam.get(winnerTeam) ?? CAPTURE_VICTORY_MIN_POINTS;
      reason = `${this.teamName(winnerTeam)} khống chế vững chắc ${heldCount}/${this.captures.length} Đài Hiệu Lệnh suốt ${CAPTURE_VICTORY_HOLD_SEC} giây — Chiến Thắng Chiến Lược!`;
    } else if (timeExpired) {
      winnerTeam = this.pickBestTiebreakTeam(aliveTeams);
      reason = `Hết thời gian giao chiến (${this.config.durationMin} phút)! ${this.teamName(winnerTeam)} giành chiến thắng nhờ ưu thế Đài Hiệu Lệnh và thực lực đại quân!`;
    } else {
      return;
    }

    const scores = this.sides.map((s) => s.score);
    const kills = this.sides.map((s) => s.kills);
    const remainingMen = this.sides.map((s) => s.totalMen);
    const winnerIdxs = this.sides
      .filter((s) => s.team === winnerTeam)
      .map((s) => s.idx);
    const durationSec = Math.max(1, Math.round(this.elapsed / 1000));
    const victoryKind = this.classifyVictoryKind(winnerTeam);

    this.result = {
      winnerTeam,
      winnerIdxs,
      reason,
      scores,
      kills,
      remainingMen,
      durationSec,
      victoryKind,
    };

    sfxOut.add('cheer');
    sfxOut.add('horn');
    this.logs.push(`🏆 ${reason}`);
    this.dirty = true;
    this.stop();
  }

  private pickBestTiebreakTeam(candidateTeams: number[]): number {
    const uniqueTeams = Array.from(new Set(candidateTeams));
    if (uniqueTeams.length === 0) return 0;

    const tiebreakValue = (team: number): number => {
      let val = 0;
      for (let i = 0; i < this.captures.length; i++) {
        const c = this.captures[i];
        if (c.ownerTeam === team) {
          val += 650 + c.progress * 2.5;
        }
      }
      for (let i = 0; i < this.sides.length; i++) {
        const s = this.sides[i];
        if (s.team === team) {
          val += s.score + s.totalMen * 0.4;
        }
      }
      return val;
    };

    uniqueTeams.sort((a, b) => tiebreakValue(b) - tiebreakValue(a) || a - b);
    return uniqueTeams[0];
  }

  private classifyVictoryKind(
    winnerTeam: number,
  ): 'heroic' | 'decisive' | 'close' | 'pyrrhic' {
    let winInitMen = 0;
    let winRemMen = 0;
    let foeInitMen = 0;

    for (let i = 0; i < this.sides.length; i++) {
      const s = this.sides[i];
      if (s.team === winnerTeam) {
        winInitMen += s.initialMen;
        winRemMen += s.totalMen;
      } else {
        foeInitMen += s.initialMen;
      }
    }

    const survivalRatio = winRemMen / Math.max(1, winInitMen);
    const outnumbered = foeInitMen > 0 && winInitMen < foeInitMen * 0.85;

    if (survivalRatio >= 0.78 || (outnumbered && survivalRatio >= 0.6)) {
      return 'heroic';
    }
    if (survivalRatio >= 0.52) {
      return 'decisive';
    }
    if (survivalRatio >= 0.28) {
      return 'close';
    }
    return 'pyrrhic';
  }

  // ==========================================================================
  // 6. ĐÓNG GÓI KHUNG HÌNH & LỌC SƯƠNG MÙ PHỤC BINH (`frameFor`)
  // ==========================================================================

  private invalidateFrameCaches(): void {
    this.spectatorFrameCache = undefined;
    this.teamFrameCache.clear();
    this.viewerFrameCache.clear();
  }

  /**
   * Trả về `TwFrame` tại nhịp hiện tại theo tầm nhìn của `viewerIdx`:
   * - Trong Pha Bố Trận (`battlePhase === 'deployment'`): ẩn toàn bộ quân địch (Fog of Deployment)
   *   để hai bên dàn trận & giấu phục binh bí mật cho tới khi Khai Chiến!
   * - Trong trận chiến (`battlePhase === 'battle'`): mọi trung đoàn địch có `hidden === true`
   *   (ẩn mình trong Rừng Thông) hoặc Chông Sắt tàng hình chưa kích hoạt đều bị lọc bỏ hoàn toàn!
   * - Khán giả (`viewerIdx === undefined`) hoặc khi trận đấu đã ngã ngũ (`this.result !== undefined`)
   *   được quan sát toàn bộ trung đoàn trên bản đồ.
   */
  frameFor(viewerIdx?: number): TwFrame {
    if (viewerIdx === undefined || this.result !== undefined) {
      if (!this.spectatorFrameCache) {
        this.spectatorFrameCache = this.buildFrameForViewer(
          undefined,
          undefined,
        );
      }
      return this.spectatorFrameCache;
    }

    const viewerSide = this.sides[viewerIdx];
    if (!viewerSide) {
      if (!this.spectatorFrameCache) {
        this.spectatorFrameCache = this.buildFrameForViewer(
          undefined,
          undefined,
        );
      }
      return this.spectatorFrameCache;
    }

    const cached = this.viewerFrameCache.get(viewerIdx);
    if (cached) return cached;

    const built = this.buildFrameForViewer(viewerSide.team, viewerIdx);
    this.viewerFrameCache.set(viewerIdx, built);
    return built;
  }

  private buildFrameForViewer(
    viewerTeam: number | undefined,
    viewerIdx: number | undefined,
  ): TwFrame {
    const totalBudgetSec = this.config.durationMin * 60;
    const timeRemainingSec = Math.max(
      0,
      Math.ceil(totalBudgetSec - this.elapsed / 1000),
    );
    const hideDeploymentEnemies =
      this.battlePhase === 'deployment' &&
      viewerTeam !== undefined &&
      this.result === undefined;

    const regFrames: TwRegimentFrame[] = [];
    for (let i = 0; i < this.regiments.length; i++) {
      const r = this.regiments[i];
      const isEnemy = viewerTeam !== undefined && r.team !== viewerTeam;

      // Ẩn toàn bộ quân địch trong Pha Bố Trận, hoặc lọc phục binh rừng thông đối với phe đối địch
      if (isEnemy && (hideDeploymentEnemies || r.hidden)) {
        continue;
      }

      const frameItem: TwRegimentFrame = {
        id: r.id,
        ownerIdx: r.ownerIdx,
        generalSlot: r.generalSlot,
        kind: r.kind,
        isGeneral: r.isGeneral,
        generalId: r.generalId,
        x: round1(r.x),
        y: round1(r.y),
        facing: Math.round(r.facing * 1000) / 1000,
        width: r.width,
        depth: r.depth,
        cols: r.cols,
        men: r.men,
        maxMen: r.maxMen,
        hp: Math.round(r.hp),
        maxHp: Math.round(r.maxHp),
        morale: round1(r.morale),
        moraleState: r.moraleState,
        fatigue: r.fatigue,
        ammo: r.ammo,
        maxAmmo: r.maxAmmo,
        formation: r.formation,
        anim: r.anim,
        hidden: r.hidden,
        inForest: r.inForest,
        onHighGround: r.onHighGround,
        guardMode: r.guardMode,
        fireAtWill: r.fireAtWill,
        skirmishMode: r.skirmishMode,
        kills: r.kills,
      };

      if (r.fireArrowActive) {
        frameItem.fireArrows = true;
      }
      const rank = r.rank ?? twRankFromKills(r.kills);
      if (rank > 0) {
        frameItem.rank = rank;
      }
      if (r.burning) {
        frameItem.burning = true;
      }
      if (r.guanxiState) {
        frameItem.guanxiState = r.guanxiState;
      }
      if (r.isGeneral && r.skillCooldownLeft > 0) {
        frameItem.skillCooldownLeft = round1(r.skillCooldownLeft);
      }
      if (r.activeBuff && r.activeBuffLeftSec > 0) {
        frameItem.activeBuff = r.activeBuff;
      }
      if (r.lockedTargetId !== undefined) {
        frameItem.lockedTargetId = r.lockedTargetId;
      }

      // Chỉ gửi điểm đến hành quân cho đồng minh hoặc khán giả (không lộ hướng điều quân cho địch)
      if (!isEnemy) {
        if (r.moveTargetX !== undefined) frameItem.moveTargetX = r.moveTargetX;
        if (r.moveTargetY !== undefined) frameItem.moveTargetY = r.moveTargetY;
        if (r.moveTargetFacing !== undefined) {
          frameItem.moveTargetFacing = Math.round(r.moveTargetFacing * 1000) / 1000;
        }
      }

      regFrames.push(frameItem);
    }

    const visibleDeployables: TwDeployableFrame[] = [];
    for (let i = 0; i < this.deployables.length; i++) {
      const d = this.deployables[i];
      if (d.hp <= 0) continue;
      const isEnemyTrap = viewerTeam !== undefined && d.team !== viewerTeam;
      if (
        isEnemyTrap &&
        (hideDeploymentEnemies || (d.hidden && !d.revealed))
      ) {
        continue;
      }
      visibleDeployables.push({
        id: d.id,
        ownerIdx: d.ownerIdx,
        team: d.team,
        kind: d.kind,
        x: round1(d.x),
        y: round1(d.y),
        facing: d.facing,
        radius: d.radius,
        hp: Math.round(d.hp),
        maxHp: Math.round(d.maxHp),
        ...(d.hidden && !d.revealed ? { hidden: true } : {}),
      });
    }

    return {
      tick: this.tickNo,
      timeRemainingSec,
      battlePhase: this.battlePhase,
      ...(this.battlePhase === 'deployment'
        ? { deploymentLeftSec: Math.ceil(this.deploymentLeftSec) }
        : {}),
      battleSpeed: this.battleSpeed,
      windAngle: Math.round(this.windAngle * 1000) / 1000,
      windStrength: this.windStrength,
      ...(viewerIdx !== undefined && this.deployZones[viewerIdx]
        ? { myDeployZone: { ...this.deployZones[viewerIdx] } }
        : {}),
      balanceOfPower: [...this.balanceOfPowerCache],
      sides: this.sideSummaryCache.map((s) => ({
        ...s,
        ...(s.deployablesLeft
          ? { deployablesLeft: { ...s.deployablesLeft } }
          : {}),
      })),
      regiments: regFrames,
      projectiles: this.projectileFramesCache,
      duels: this.duelFramesCache,
      banters: this.banters.map((b) => ({ ...b })),
      captures: this.captures.map((c) => ({ ...c })),
      fires: this.fireFramesCache.map((f) => ({ ...f })),
      deployables: visibleDeployables,
      sfxEvents: [...this.lastSfxEvents],
    };
  }
}
