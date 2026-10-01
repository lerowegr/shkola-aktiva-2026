/**
 * Список прав платформы.
 *
 * Права зашиты в код намеренно: набор действий, которые вообще существуют
 * в системе, определяется её кодом, а не содержимым базы. В админке из
 * этого списка рисуются галочки, а роли собираются уже из них — поэтому
 * главный организатор может придумать любую роль, не трогая разработчика.
 *
 * Отбор — единый поток, поэтому прав «в границах направления» здесь нет:
 * право либо есть, либо нет.
 */

export type PermissionGroupKey = "selection" | "people" | "content" | "system";

export interface PermissionDefinition {
  key: string;
  label: string;
  description: string;
}

export interface PermissionGroup {
  key: PermissionGroupKey;
  label: string;
  permissions: PermissionDefinition[];
}

export const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  {
    key: "selection",
    label: "Отбор",
    permissions: [
      {
        key: "applications.review",
        label: "Оценивать анкеты",
        description: "Проверять назначенные анкеты и домашние задания, ставить баллы и маркеры.",
      },
      {
        key: "applications.view_all",
        label: "Видеть все анкеты",
        description: "Открывать любые анкеты и чужие оценки — только для просмотра.",
      },
      {
        key: "applications.assign",
        label: "Распределять анкеты",
        description: "Назначать анкеты мастерам отбора и перераспределять их.",
      },
      {
        key: "applications.decide",
        label: "Принимать решения",
        description: "Переводить кандидатов на следующий этап и объявлять итоги.",
      },
      {
        key: "messages.reply",
        label: "Переписываться с кандидатами",
        description: "Отвечать кандидатам — ответ приходит им от бота.",
      },
      {
        key: "interviews.manage",
        label: "Вести собеседования",
        description: "Открывать слоты, проводить собеседования и оценивать их.",
      },
      {
        key: "stages.manage",
        label: "Управлять этапами",
        description: "Задавать даты этапов, открывать и закрывать их вручную.",
      },
      {
        key: "forms.manage",
        label: "Настраивать анкету и критерии",
        description: "Менять вопросы анкеты, домашнее задание и критерии оценки.",
      },
    ],
  },
  {
    key: "people",
    label: "Люди и роли",
    permissions: [
      {
        key: "users.manage",
        label: "Управлять организаторами",
        description: "Приглашать организаторов, выдавать им роли и блокировать доступ.",
      },
      {
        key: "roles.manage",
        label: "Настраивать роли",
        description: "Создавать роли и менять их права. Самое сильное право в системе.",
      },
      {
        key: "notifications.broadcast",
        label: "Делать рассылки",
        description: "Писать кандидатам массово: на сайт, в пуши и в Telegram.",
      },
    ],
  },
  {
    key: "content",
    label: "Сайт",
    permissions: [
      {
        key: "content.manage",
        label: "Редактировать сайт",
        description: "Менять тексты, даты и фотографии на внешнем сайте.",
      },
    ],
  },
  {
    key: "system",
    label: "Данные и контроль",
    permissions: [
      {
        key: "dashboards.view",
        label: "Смотреть дашборды",
        description: "Воронка, динамика заявок, прогресс проверки и статистика.",
      },
      {
        key: "audit.view",
        label: "Смотреть журнал действий",
        description: "Кто, что и когда менял в системе.",
      },
    ],
  },
];

/** Плоский список всех определений прав. */
export const ALL_PERMISSIONS: readonly PermissionDefinition[] = PERMISSION_GROUPS.flatMap(
  (group) => group.permissions,
);

/** Все ключи прав — то, что реально лежит в Role.permissions. */
export const PERMISSION_KEYS: readonly string[] = ALL_PERMISSIONS.map(
  (permission) => permission.key,
);

const KNOWN = new Set(PERMISSION_KEYS);

export function isKnownPermission(key: string): boolean {
  return KNOWN.has(key);
}

/**
 * Отбрасывает ключи, которых нет в списке. Нужно при сохранении роли из
 * админки: в базу не должно попасть право, которого нет в коде, иначе оно
 * навсегда останется невидимой строкой в массиве.
 */
export function sanitizePermissions(keys: readonly string[]): string[] {
  return [...new Set(keys.filter(isKnownPermission))];
}

// ---------------------------------------------------------------------------
// Проверка доступа
// ---------------------------------------------------------------------------

/** Минимум сведений о человеке, достаточный для проверки прав. */
export interface Actor {
  isOwner: boolean;
  /** Заблокированный не может ничего. */
  isActive: boolean;
  /** Права всех его ролей вместе. */
  permissions: readonly string[];
}

/**
 * Может ли человек выполнить действие.
 *
 * Единственная точка проверки прав в проекте. Любой серверный обработчик,
 * меняющий данные, начинается с неё: спрятать кнопку в интерфейсе — не
 * защита, маршрут доступен прямым запросом.
 */
export function can(actor: Actor, permission: string): boolean {
  // Неизвестный ключ — ошибка в коде, а не повод пустить.
  if (!isKnownPermission(permission)) return false;

  // Владелец может всё: иначе неудачная правка ролей запирает всех снаружи.
  if (actor.isOwner) return true;

  if (!actor.isActive) return false;

  return actor.permissions.includes(permission);
}

/** Есть ли хотя бы одно из прав. */
export function canAny(actor: Actor, permissions: readonly string[]): boolean {
  return permissions.some((permission) => can(actor, permission));
}

/** Права из набора, которых у человека нет. */
export function missingPermissions(actor: Actor, permissions: readonly string[]): string[] {
  return permissions.filter((permission) => !can(actor, permission));
}

/**
 * Может ли человек выдать роль с таким набором прав.
 *
 * Только если все её права уже есть у него самого. Иначе организатор с
 * правом «управлять организаторами» выдал бы себе роль тех.админа.
 */
export function canGrantRole(actor: Actor, rolePermissions: readonly string[]): boolean {
  return missingPermissions(actor, rolePermissions).length === 0;
}
