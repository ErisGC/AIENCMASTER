'use client';

import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { DateRange } from 'react-day-picker';

import DateRangePicker from '@/app/components/DateRangePicker/DateRangePicker';
import styles from './FiltersPanel.module.css';

interface Props {
  titleEnabled: boolean;
  setTitleEnabled: (value: boolean) => void;
  title: string;
  setTitle: (value: string) => void;
  dateEnabled: boolean;
  setDateEnabled: (value: boolean) => void;
  fromDate: string;
  setFromDate: (value: string) => void;
  toDate: string;
  setToDate: (value: string) => void;
}

export function FiltersPanel(props: Props) {
  const range: DateRange | undefined = useMemo(() => {
    if (!props.fromDate) return undefined;

    return {
      from: parseISO(props.fromDate),
      to: props.toDate ? parseISO(props.toDate) : undefined,
    };
  }, [props.fromDate, props.toDate]);

  const handleRangeChange = (rangeValue: DateRange | undefined) => {
    if (!rangeValue?.from) {
      props.setFromDate('');
      props.setToDate('');
      return;
    }

    props.setFromDate(format(rangeValue.from, 'yyyy-MM-dd'));
    props.setToDate(
      rangeValue.to
        ? format(rangeValue.to, 'yyyy-MM-dd')
        : format(rangeValue.from, 'yyyy-MM-dd'),
    );
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.eyebrow}>Filtros</span>
        <p className={styles.description}>
          Activa solo los criterios que necesites para refinar el listado.
        </p>
      </div>

      <div className={styles.stack}>
        <label className={styles.filterCard}>
          <span className={styles.toggleRow}>
            <input
              type="checkbox"
              checked={props.titleEnabled}
              onChange={(event) => props.setTitleEnabled(event.target.checked)}
            />
            <span className={styles.filterTitle}>Título</span>
          </span>

          {/* Se puede escribir de una vez: al escribir, el filtro se activa
              solo (antes había que marcar la casilla primero). */}
          <input
            type="text"
            className={styles.input}
            value={props.title}
            onChange={(event) => {
              props.setTitle(event.target.value);
              props.setTitleEnabled(event.target.value.trim().length > 0);
            }}
            placeholder="Buscar por título"
          />
        </label>

        <div className={styles.filterCard}>
          <label className={styles.toggleRow}>
            <input
              type="checkbox"
              checked={props.dateEnabled}
              onChange={(event) => {
                const checked = event.target.checked;
                props.setDateEnabled(checked);

                if (!checked) {
                  props.setFromDate('');
                  props.setToDate('');
                }
              }}
            />
            <span className={styles.filterTitle}>Fecha</span>
          </label>

          {props.dateEnabled ? (
            <div className={styles.pickerWrap}>
              <DateRangePicker range={range} onChange={handleRangeChange} />
            </div>
          ) : (
            <span className={styles.muted}>Filtro desactivado</span>
          )}
        </div>
      </div>
    </div>
  );
}
