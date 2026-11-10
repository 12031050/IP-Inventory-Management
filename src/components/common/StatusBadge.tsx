import { cn } from '@/lib/utils';
import { IP_STATUS_LABELS, type IPStatus } from '@/types';

const styles: Record<IPStatus, string> = {
  allocated: 'bg-success/15 text-success',
  unallocated: 'bg-muted text-muted-foreground',
  reserved: 'bg-info/15 text-info',
  conflict: 'bg-destructive/15 text-destructive',
};

export default function StatusBadge({ status, className }: { status: IPStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        styles[status],
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', {
        'bg-success': status === 'allocated',
        'bg-muted-foreground': status === 'unallocated',
        'bg-info': status === 'reserved',
        'bg-destructive': status === 'conflict',
      })} />
      {IP_STATUS_LABELS[status]}
    </span>
  );
}