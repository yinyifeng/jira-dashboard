const colorMap: Record<string, string> = {
  'blue-gray': 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  yellow: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  green: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  medium: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
};

interface StatusBadgeProps {
  name: string;
  colorName: string;
}

export default function StatusBadge({ name, colorName }: StatusBadgeProps) {
  const classes = colorMap[colorName] || colorMap['blue-gray'];
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${classes}`}>
      {name}
    </span>
  );
}
