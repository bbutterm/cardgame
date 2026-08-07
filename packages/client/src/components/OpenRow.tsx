import { useEffect, useRef, useState } from 'react';
import type { CardInstance } from '@delezh/engine';
import { CardSlotGhost, CardView } from './Card.js';
import { haptic, playSound } from '../audio.js';
import './openrow.css';

export interface OpenRowProps {
  slots: (CardInstance | null)[];
  selectedUid: string | null;
  onSelect: (uid: string | null) => void;
  onConfirm: (uid: string) => void;
  /** Long-press opens the full card. */
  onRead: (cardId: string) => void;
  interactive: boolean;
}

/** How long a press has to be held before it reads the card instead of selecting it. */
const LONG_PRESS_MS = 380;
/** A press that wanders further than this is a scroll, not a tap. */
const MOVE_TOLERANCE_PX = 12;
/** Upward flick distance that commits a pick without the confirm button. */
const SWIPE_COMMIT_PX = 44;

/**
 * The five open cards.
 *
 * Taken slots keep their footprint as a dashed ghost, so the row never reflows
 * under a thumb that is already moving toward a card — the single most annoying
 * failure mode of a touch layout.
 *
 * Picking is deliberately two-step (select, then confirm). A pick is
 * irreversible and the timer is short; a stray tap that spends your turn would
 * be much worse than one extra tap. Double-tap and swipe-up are shortcuts for
 * players who have learned the game, and a long press reads the card.
 */
export function OpenRow({ slots, selectedUid, onSelect, onConfirm, onRead, interactive }: OpenRowProps) {
  const [pressing, setPressing] = useState<string | null>(null);
  const gesture = useRef<{ uid: string; x: number; y: number; timer: number; handled: boolean } | null>(null);
  const lastTap = useRef<{ uid: string; at: number } | null>(null);

  // Clear the selection when the card stops being available (row advanced).
  useEffect(() => {
    if (selectedUid && !slots.some((slot) => slot?.uid === selectedUid)) onSelect(null);
  }, [slots, selectedUid, onSelect]);

  // A press in flight when the row changes must not fire on the new card.
  useEffect(
    () => () => {
      if (gesture.current) window.clearTimeout(gesture.current.timer);
    },
    [],
  );

  const endGesture = () => {
    if (gesture.current) window.clearTimeout(gesture.current.timer);
    gesture.current = null;
    setPressing(null);
  };

  const startPress = (uid: string, cardId: string, x: number, y: number) => {
    const timer = window.setTimeout(() => {
      if (!gesture.current || gesture.current.uid !== uid) return;
      gesture.current.handled = true;
      setPressing(null);
      haptic(18);
      onRead(cardId);
    }, LONG_PRESS_MS);
    gesture.current = { uid, x, y, timer, handled: false };
    setPressing(uid);
  };

  const handleTap = (uid: string) => {
    if (!interactive) return;
    const now = Date.now();
    const previous = lastTap.current;
    lastTap.current = { uid, at: now };

    // Double tap on the same card confirms, matching the swipe-up shortcut.
    if (previous && previous.uid === uid && now - previous.at < 400) {
      onConfirm(uid);
      return;
    }
    playSound('tap');
    haptic(8);
    onSelect(selectedUid === uid ? null : uid);
  };

  const rows = [slots.slice(0, 3), slots.slice(3)];

  return (
    <div className="openrow">
      {rows.map((group, groupIndex) => (
        <div className={`openrow__line openrow__line--${group.length}`} key={groupIndex}>
          {group.map((slot, index) =>
            slot ? (
              <div
                className={`openrow__cell ${pressing === slot.uid ? 'is-pressing' : ''}`}
                key={slot.uid}
                onTouchStart={(event) => {
                  const touch = event.touches[0];
                  if (touch) startPress(slot.uid, slot.cardId, touch.clientX, touch.clientY);
                }}
                onTouchMove={(event) => {
                  const touch = event.touches[0];
                  const active = gesture.current;
                  if (!touch || !active) return;
                  // Sliding off cancels the long press but keeps the swipe alive.
                  if (Math.abs(touch.clientX - active.x) > MOVE_TOLERANCE_PX) endGesture();
                }}
                onTouchEnd={(event) => {
                  const touch = event.changedTouches[0];
                  const active = gesture.current;
                  const wasLongPress = active?.handled ?? false;
                  const startY = active?.y;
                  endGesture();
                  if (wasLongPress) {
                    event.preventDefault();
                    return;
                  }
                  // Flick a card upward to take it without the confirm button.
                  if (interactive && touch && startY !== undefined && startY - touch.clientY > SWIPE_COMMIT_PX) {
                    event.preventDefault();
                    onConfirm(slot.uid);
                  }
                }}
                onTouchCancel={endGesture}
                onContextMenu={(event) => {
                  // Desktop right-click reads the card too, and on mobile this
                  // suppresses the browser's own long-press menu.
                  event.preventDefault();
                  onRead(slot.cardId);
                }}
              >
                {/*
                  Not dimmed while the opponent thinks: the faction colours are
                  the board's main signal and greying them out for half the
                  match hid the thing the player is supposed to be reading.
                  Whose turn it is comes from the banner and the timer instead.
                */}
                <CardView
                  cardId={slot.cardId}
                  size="full"
                  selected={selectedUid === slot.uid}
                  disabled={!interactive}
                  onClick={() => handleTap(slot.uid)}
                />
              </div>
            ) : (
              <div className="openrow__cell" key={`ghost-${groupIndex}-${index}`}>
                <CardSlotGhost />
              </div>
            ),
          )}
        </div>
      ))}
    </div>
  );
}
