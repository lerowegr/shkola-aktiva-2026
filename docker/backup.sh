#!/bin/sh
# Ночные копии: база и загруженные файлы (домашки, фото сайта).
#
# Отдельным контейнером, а не cron на сервере: cron хоста живёт вне compose,
# и при переезде его забывают. Здесь копии переезжают вместе со всем.
#
# Копия базы проверяется сразу после снятия: пустой или обрезанный дамп —
# худшая копия, она есть, и поэтому никто не проверяет, что её нет.
# Устроено как у портала СНиМК на этом же сервере.

set -eu

KEEP_DAYS="${KEEP_DAYS:-14}"
DIR=/backups
log() { echo "[$(date '+%F %T')] $1"; }

mkdir -p "$DIR"

snapshot() {
  stamp=$(date +%Y-%m-%d_%H-%M)
  file="$DIR/sha-db-$stamp.sql.gz"
  log "снимаю копию базы → $file"

  if ! pg_dump --no-owner --no-privileges | gzip -9 > "$file"; then
    log "ОШИБКА: pg_dump не отработал" >&2
    rm -f "$file"
    return 1
  fi
  # В трубе код выхода pg_dump теряется — смотрим на размер и содержимое.
  size=$(wc -c < "$file")
  if [ "$size" -lt 4096 ] || ! gzip -dc "$file" | grep -q "CREATE TABLE" || ! gzip -t "$file"; then
    log "ОШИБКА: копия базы пустая или битая ($size б), удаляю" >&2
    rm -f "$file"
    return 1
  fi
  log "база: готово, $size б"

  # Файлы — архивом целиком: их немного (PDF домашек и фото сайта).
  if [ -d /uploads ]; then
    files="$DIR/sha-uploads-$stamp.tar.gz"
    if tar -czf "$files" -C /uploads . 2>/dev/null; then
      log "файлы: готово, $(wc -c < "$files") б"
    else
      log "ОШИБКА: архив файлов не собрался" >&2
      rm -f "$files"
    fi
  fi

  find "$DIR" -name 'sha-*' -type f -mtime "+$KEEP_DAYS" -delete
}

# Первую копию — сразу: если что-то настроено не так, узнать надо сейчас.
snapshot || true

# Секунды до ближайших 03:30 по времени контейнера (UTC = 06:30 МСК).
# Арифметикой, а не `date -d`: date из BusyBox не понимает ни GNU, ни BSD.
# Ведущие нули убираем: «09» в арифметике оболочки — восьмеричное число.
seconds_until_0330() {
  h=$(date +%H); h=${h#0}; h=${h:-0}
  m=$(date +%M); m=${m#0}; m=${m:-0}
  s=$(date +%S); s=${s#0}; s=${s:-0}
  passed=$(( h * 3600 + m * 60 + s ))
  target=$(( 3 * 3600 + 30 * 60 ))
  if [ "$passed" -lt "$target" ]; then echo $(( target - passed )); else echo $(( 86400 - passed + target )); fi
}

while true; do
  sleep "$(seconds_until_0330)"
  snapshot || true
done
