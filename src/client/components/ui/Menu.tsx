import type { ReactNode } from 'react';
import {
  Button as AriaButton,
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  MenuSection,
  MenuTrigger,
  Popover,
  Separator,
  Header,
} from 'react-aria-components';

import clsx from 'clsx';
import { Check } from 'lucide-react';

import buttonStyles from './Button.module.css';
import styles from './Menu.module.css';

export type MenuEntry =
  | {
      id: string;
      label: ReactNode;
      icon?: ReactNode;
      /** Shows a check mark (a choice in a list of options). */
      selected?: boolean;
      danger?: boolean;
      /** Shown, but can't be chosen. */
      disabled?: boolean;
      onAction: () => void;
    }
  | { id: string; separator: true }
  | { id: string; heading: ReactNode };

/** A button that opens a list of actions. */
export function Menu({
  label,
  trigger,
  entries,
}: {
  /** Accessible name of the button. */
  label: string;
  trigger: ReactNode;
  entries: MenuEntry[];
}) {
  return (
    <MenuTrigger>
      <AriaButton aria-label={label} className={clsx(buttonStyles.button, buttonStyles.icon, buttonStyles.ghost)}>
        {trigger}
      </AriaButton>
      <Popover className={styles.popover} placement="bottom end" offset={6}>
        <AriaMenu className={styles.menu}>
          <MenuSection className={styles.section}>
            {entries.map(entry => {
              if ('separator' in entry) return <Separator key={entry.id} className={styles.separator} />;
              if ('heading' in entry) {
                return (
                  <Header key={entry.id} className={styles.heading}>
                    {entry.heading}
                  </Header>
                );
              }
              return (
                <AriaMenuItem
                  key={entry.id}
                  id={entry.id}
                  isDisabled={entry.disabled}
                  onAction={entry.onAction}
                  className={clsx(styles.item, entry.danger && styles.danger)}
                >
                  <span className={styles.icon}>
                    {entry.selected ? <Check size={18} strokeWidth={2.5} /> : entry.icon}
                  </span>
                  <span className={styles.label}>{entry.label}</span>
                </AriaMenuItem>
              );
            })}
          </MenuSection>
        </AriaMenu>
      </Popover>
    </MenuTrigger>
  );
}
