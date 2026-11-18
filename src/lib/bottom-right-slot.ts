/**
 * Hàng đợi ưu tiên (Priority Queue) cho Float message toàn ứng dụng (owner 2026-11-18, REQ-20261118-02):
 *   - Ưu tiên #1 (CACHE = 1): Thông báo Tạo cache
 *   - Ưu tiên #2 (ASSIGNED_TASKS = 2): Thông báo My assigned tasks
 *   - Ưu tiên cuối cùng (SYSTEM_CONFIG = 3): Nội dung Float message cấu hình tại Quản trị hệ thống của SUPERADMIN
 *
 * Quy tắc:
 *   - Mọi nội dung không thuộc SYSTEM_CONFIG (#3) luôn có timeout = 10 giây (NON_ADMIN_FLOAT_TIMEOUT_SECONDS) và
 *     có nút đóng message chữ 'x' (dismissible = true).
 *   - Các float message hiển thị lần lượt cách nhau 2 giây (FLOAT_MESSAGE_GAP_MS = 2000): message có mức ưu tiên sau
 *     chỉ hiển thị sau khi message trước đã kết thúc timeout + 2 giây chờ, hoặc sau khi message trước bị tắt + 2 giây chờ.
 *   - Module thuần (không phụ thuộc React hay database) để kiểm thử đơn vị toàn diện.
 */

export const FLOAT_MESSAGE_PRIORITY = {
  CACHE: 1,
  ASSIGNED_TASKS: 2,
  SYSTEM_CONFIG: 3,
} as const;

export type FloatMessagePriority = (typeof FLOAT_MESSAGE_PRIORITY)[keyof typeof FLOAT_MESSAGE_PRIORITY];

/** Mọi nội dung ngoài cấu hình Quản trị hệ thống của SUPERADMIN luôn có timeout = 10 giây. */
export const NON_ADMIN_FLOAT_TIMEOUT_SECONDS = 10;

/** Thời gian chờ (2 giây) giữa 2 Float message liên tiếp. */
export const FLOAT_MESSAGE_GAP_MS = 2000;

export type QueuedFloatMessagePosition = 'TOP_RIGHT' | 'BOTTOM_RIGHT';

export interface QueuedFloatMessageInput {
  /** null = luôn hiển thị (chỉ áp dụng cho SYSTEM_CONFIG; các loại khác luôn = 10 giây). */
  autoHideSeconds?: number | null;
  /** Chỉ áp dụng cho SYSTEM_CONFIG; các loại khác luôn = true (có nút 'x'). */
  dismissible?: boolean;
  /** Định danh tuỳ chọn để cập nhật/tránh trùng lặp cùng một thông báo trong hàng đợi. */
  id?: string;
  /** Hành động khi bấm vào hộp thông báo (ví dụ: mở danh sách My assigned epics). */
  onClick?: () => void;
  position?: QueuedFloatMessagePosition;
  priority: FloatMessagePriority;
  text: string;
}

export interface QueuedFloatMessage {
  autoHideSeconds: number | null;
  dismissible: boolean;
  id: string;
  onClick?: () => void;
  position?: QueuedFloatMessagePosition;
  priority: FloatMessagePriority;
  seq: number;
  text: string;
}

export interface FloatQueueSnapshot {
  active: QueuedFloatMessage | null;
  coolingDown: boolean;
  queuedCount: number;
}

export interface FloatQueueTimers {
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
  setTimeout: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
}

const defaultTimers: FloatQueueTimers = {
  clearTimeout: (handle) => clearTimeout(handle),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
};

/**
 * Hàng đợi Float message độc lập, có thể truyền bộ timer giả trong unit test để kiểm tra chính xác
 * thứ tự ưu tiên (#1 → #2 → #3), timeout 10s và khoảng chờ 2s.
 */
export class FloatMessageQueue {
  private activeItem: QueuedFloatMessage | null = null;
  private autoHideTimer: ReturnType<typeof setTimeout> | null = null;
  private cooldownTimer: ReturnType<typeof setTimeout> | null = null;
  private isCoolingDown = false;
  private readonly items: QueuedFloatMessage[] = [];
  private readonly listeners = new Set<() => void>();
  private nextSeq = 1;
  /** Các tác vụ kiểm tra lúc mới tải trang giữ chỗ theo mức ưu tiên để message ưu tiên thấp không bật trước khi check xong. */
  private readonly pendingChecks = new Map<string, FloatMessagePriority>();
  private snapshotCache: FloatQueueSnapshot = { active: null, coolingDown: false, queuedCount: 0 };
  private readonly timers: FloatQueueTimers;

  constructor(timers: FloatQueueTimers = defaultTimers) {
    this.timers = timers;
  }

  private emit(): void {
    this.snapshotCache = {
      active: this.activeItem,
      coolingDown: this.isCoolingDown,
      queuedCount: this.items.length,
    };
    for (const listener of this.listeners) listener();
  }

  private sortQueue(): void {
    this.items.sort((a, b) => a.priority - b.priority || a.seq - b.seq);
  }

  private highestPendingCheckPriority(): number {
    let min = Infinity;
    for (const priority of this.pendingChecks.values()) {
      if (priority < min) min = priority;
    }
    return min;
  }

  private clearAutoHideTimer(): void {
    if (this.autoHideTimer !== null) {
      this.timers.clearTimeout(this.autoHideTimer);
      this.autoHideTimer = null;
    }
  }

  private clearCooldownTimer(): void {
    if (this.cooldownTimer !== null) {
      this.timers.clearTimeout(this.cooldownTimer);
      this.cooldownTimer = null;
    }
  }

  private scheduleNextIfReady(): void {
    if (this.activeItem !== null || this.isCoolingDown || this.items.length === 0) return;
    this.sortQueue();
    const candidate = this.items[0];
    // Nếu còn một kiểm tra khởi tạo có mức ưu tiên cao hơn đang chạy (ví dụ #1 hoặc #2 chưa trả kết quả),
    // tạm chờ kiểm tra đó hoàn tất trước khi hiển thị message có mức ưu tiên thấp hơn (#3).
    if (candidate.priority > this.highestPendingCheckPriority()) return;

    this.items.shift();
    this.activeItem = candidate;
    this.clearAutoHideTimer();
    if (candidate.autoHideSeconds !== null && candidate.autoHideSeconds > 0) {
      this.autoHideTimer = this.timers.setTimeout(() => {
        this.autoHideTimer = null;
        this.dismissActive();
      }, candidate.autoHideSeconds * 1000);
    }
  }

  private startCooldown(): void {
    this.clearCooldownTimer();
    this.isCoolingDown = true;
    this.cooldownTimer = this.timers.setTimeout(() => {
      this.cooldownTimer = null;
      this.isCoolingDown = false;
      this.scheduleNextIfReady();
      this.emit();
    }, FLOAT_MESSAGE_GAP_MS);
  }

  /**
   * Đưa một Float message vào hàng đợi.
   * Mọi nội dung có priority !== SYSTEM_CONFIG đều tự động chuẩn hoá: autoHideSeconds = 10, dismissible = true.
   */
  enqueue(input: QueuedFloatMessageInput): QueuedFloatMessage | null {
    const text = input.text.trim();
    if (!text) return null;
    const isSystemConfig = input.priority === FLOAT_MESSAGE_PRIORITY.SYSTEM_CONFIG;
    const autoHideSeconds = isSystemConfig ? (input.autoHideSeconds ?? null) : NON_ADMIN_FLOAT_TIMEOUT_SECONDS;
    const dismissible = isSystemConfig ? (input.dismissible ?? true) : true;
    const seq = this.nextSeq++;
    const id = input.id ?? `float-msg-${seq}`;

    const item: QueuedFloatMessage = {
      autoHideSeconds,
      dismissible,
      id,
      onClick: input.onClick,
      position: input.position,
      priority: input.priority,
      seq,
      text,
    };

    // Nếu đang hiển thị cùng id (ví dụ SUPERADMIN vừa cập nhật nội dung SYSTEM_CONFIG), cập nhật trực tiếp.
    if (this.activeItem && this.activeItem.id === id) {
      this.activeItem = { ...item, seq: this.activeItem.seq };
      this.clearAutoHideTimer();
      if (this.activeItem.autoHideSeconds !== null && this.activeItem.autoHideSeconds > 0) {
        this.autoHideTimer = this.timers.setTimeout(() => {
          this.autoHideTimer = null;
          this.dismissActive();
        }, this.activeItem.autoHideSeconds * 1000);
      }
      this.emit();
      return this.activeItem;
    }

    // Thay thế nếu trong hàng đợi đã có sẵn phần tử cùng id (giữ nguyên seq ban đầu nếu cùng priority).
    const existingIdx = this.items.findIndex((existing) => existing.id === id);
    if (existingIdx >= 0) {
      const prev = this.items[existingIdx];
      this.items[existingIdx] = { ...item, seq: prev.priority === item.priority ? prev.seq : item.seq };
    } else {
      this.items.push(item);
    }
    this.sortQueue();

    // Nếu message đang hiển thị là SYSTEM_CONFIG (#3, nhất là khi cấu hình "Luôn hiển thị") mà có một message
    // ưu tiên cao hơn (#1 Tạo cache hoặc #2 My assigned tasks) vừa vào hàng đợi, đưa #3 trở lại cuối hàng đợi
    // và chuyển sang chờ 2s để nhường quyền hiển thị cho message ưu tiên cao hơn.
    if (
      this.activeItem
      && this.activeItem.priority === FLOAT_MESSAGE_PRIORITY.SYSTEM_CONFIG
      && item.priority < this.activeItem.priority
    ) {
      const preempted = this.activeItem;
      this.clearAutoHideTimer();
      this.activeItem = null;
      if (!this.items.some((queued) => queued.id === preempted.id)) {
        this.items.push(preempted);
        this.sortQueue();
      }
      this.startCooldown();
      this.emit();
      return item;
    }

    this.scheduleNextIfReady();
    this.emit();
    return item;
  }

  /** Đóng message đang hiển thị (do hết timeout hoặc do người dùng bấm 'x') và bắt đầu 2 giây chờ trước message kế tiếp. */
  dismissActive(expectedId?: string): void {
    if (!this.activeItem) return;
    if (expectedId !== undefined && this.activeItem.id !== expectedId) return;
    this.clearAutoHideTimer();
    this.activeItem = null;
    this.startCooldown();
    this.emit();
  }

  /** Xoá một message theo id khỏi hàng đợi (và đóng nếu nó đang hiển thị, ví dụ khi SYSTEM_CONFIG bị tắt). */
  removeById(id: string): void {
    const idx = this.items.findIndex((item) => item.id === id);
    if (idx >= 0) this.items.splice(idx, 1);
    if (this.activeItem?.id === id) {
      this.clearAutoHideTimer();
      this.activeItem = null;
      if (this.items.length > 0) this.startCooldown();
    }
    this.emit();
  }

  /**
   * Giữ chỗ kiểm tra khởi tạo (ví dụ khi mới mở trang đang gọi API kiểm tra Tạo cache #1 hoặc My assigned tasks #2)
   * để đảm bảo message ưu tiên thấp hơn (#3) không hiện ra trước khi kết quả #1/#2 kịp vào hàng đợi.
   */
  holdCheck(owner: string, priority: FloatMessagePriority = FLOAT_MESSAGE_PRIORITY.ASSIGNED_TASKS): () => void {
    this.pendingChecks.set(owner, priority);
    this.emit();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.pendingChecks.delete(owner);
      this.scheduleNextIfReady();
      this.emit();
    };
  }

  isBusy(): boolean {
    return this.pendingChecks.size > 0 || this.activeItem !== null || this.isCoolingDown || this.items.length > 0;
  }

  hasPendingChecks(): boolean {
    return this.pendingChecks.size > 0;
  }

  getSnapshot(): FloatQueueSnapshot {
    return this.snapshotCache;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Đặt lại toàn bộ trạng thái hàng đợi (dùng trong test). */
  reset(): void {
    this.clearAutoHideTimer();
    this.clearCooldownTimer();
    this.activeItem = null;
    this.isCoolingDown = false;
    this.items.length = 0;
    this.pendingChecks.clear();
    this.nextSeq = 1;
    this.emit();
  }
}

const defaultQueue = new FloatMessageQueue();

export function enqueueFloatMessage(input: QueuedFloatMessageInput): QueuedFloatMessage | null {
  return defaultQueue.enqueue(input);
}

/** Đưa thông báo Tạo cache (Ưu tiên #1, timeout = 10s, có nút 'x') vào hàng đợi Float message. */
export function enqueueCacheFloatMessage(text: string, id?: string): QueuedFloatMessage | null {
  return defaultQueue.enqueue({
    id,
    priority: FLOAT_MESSAGE_PRIORITY.CACHE,
    text,
  });
}

/** Đưa thông báo My assigned tasks (Ưu tiên #2, timeout = 10s, có nút 'x') vào hàng đợi Float message. */
export function enqueueAssignedTasksFloatMessage(options: { onClick?: () => void; text: string }): QueuedFloatMessage | null {
  return defaultQueue.enqueue({
    id: 'assigned-tasks-notice',
    onClick: options.onClick,
    priority: FLOAT_MESSAGE_PRIORITY.ASSIGNED_TASKS,
    text: options.text,
  });
}

export function dismissActiveFloatMessage(expectedId?: string): void {
  defaultQueue.dismissActive(expectedId);
}

export function removeFloatMessageById(id: string): void {
  defaultQueue.removeById(id);
}

export function getFloatQueueSnapshot(): FloatQueueSnapshot {
  return defaultQueue.getSnapshot();
}

export function subscribeFloatQueue(listener: () => void): () => void {
  return defaultQueue.subscribe(listener);
}

/** Giữ tương thích với API claimBottomRightSlot cũ: giữ chỗ kiểm tra trước khi hiển thị SYSTEM_CONFIG (#3). */
export function claimBottomRightSlot(owner: string, priority: FloatMessagePriority = FLOAT_MESSAGE_PRIORITY.ASSIGNED_TASKS): () => void {
  return defaultQueue.holdCheck(owner, priority);
}

export function isBottomRightSlotBusy(): boolean {
  return defaultQueue.hasPendingChecks();
}

export function subscribeBottomRightSlot(listener: () => void): () => void {
  return defaultQueue.subscribe(listener);
}
