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
  interactive: boolean;
}

/**
 * The five open cards.
 *
 * Taken slots keep their footprint as a dashed ghost, so the row never reflows
 * under a thumb that is already moving toward a card — the single most annoying
 * failure mode of a touch layout.
 *
 * Picking is deliberately two-step (select, then confirm). A pick is
 * irreversible and the timer is short; a stray tap that spends your turn would
 * be much worse than one extra tap.
 */
export function OpenRow({ slots, selectedUid, onSelect, onConfirm, interactive }: OpenRowProps) {
  const [swipe, setSwipe] = useState<{ uid: string; startY: number } | null>(null);
  const lastTap = useRef<{ uid: string; at: number } | null>(null);

  // Clear the selection when the card stops being available (row advanced).
  useEffect(() => {
    if (selectedUid && !slots.some((slot) => slot?.uid === selectedUid)) onSelect(null);
  }, [slots, selectedUid, onSelect]);

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
                className="openrow__cell"
                key={slot.uid}
                onTouchStart={(event) => {
                  const touch = event.touches[0];
                  if (touch) setSwipe({ uid: slot.uid, startY: touch.clientY });
                }}
                onTouchEnd={(event) => {
                  const touch = event.changedTouches[0];
                  if (!interactive || !swipe || swipe.uid !== slot.uid || !touch) {
                    setSwipe(null);
                    return;
                  }
                  // Flick a card upward to take it without the confirm button.
                  if (swipe.startY - touch.clientY > 44) {
                    event.preventDefault();
                    onConfirm(slot.uid);
                  }
                  setSwipe(null);
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
