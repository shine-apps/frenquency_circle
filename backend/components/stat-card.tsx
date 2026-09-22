import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card"

type StatCardProps = {
  label: string
  value: number | string
  description?: string
  icon?: React.ReactNode
}

export function StatCard({ label, value, description, icon }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardDescription className="font-medium text-foreground">
          {label}
        </CardDescription>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
        {description ? (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}
