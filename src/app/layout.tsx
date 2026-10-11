import './globals.css'
import Recoil from '@/contexts/recoil'
import SplashScreen from '@/components/SplashScreen/SplashScreen'

export const metadata = {
  title: 'Nijoow Drawing',
  description: 'SVG Drawing App',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="w-full h-full">
      <body className="font-sans overflow-hidden w-full h-full">
        <Recoil>
          <SplashScreen />
          {children}
        </Recoil>
      </body>
    </html>
  )
}
