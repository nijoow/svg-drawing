import './globals.css'
import { Provider } from 'jotai'
import { appName } from '@/appName'

export const metadata = {
  title: appName,
  description: '도형과 자유선을 그리고 편집하는 SVG 드로잉 도구',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="w-full h-full">
      <body className="overflow-hidden w-full h-full">
        <Provider>{children}</Provider>
      </body>
    </html>
  )
}
