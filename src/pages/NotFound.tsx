import { SearchX } from 'lucide-react'
import { ButtonLink, EmptyState } from '../components/ui'

export default function NotFound() {
  return (
    <div className="card">
      <EmptyState icon={SearchX} title="Page not found" body="That page doesn’t exist." action={<ButtonLink to="/">Go to dashboard</ButtonLink>} />
    </div>
  )
}
