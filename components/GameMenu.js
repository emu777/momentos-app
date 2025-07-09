import { supabase } from '../lib/supabase';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

// HeroiconsのSVGを直接使用
const EllipsisVerticalIcon = (props) => ( // 縦の三点リーダーアイコン
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5zm0 6a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5zm0 6a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5z" />
  </svg>
);

export default function GameMenu() {
  return (
    <div
      // Tailwindのクラスが正しく適用されない問題への対策として、インラインスタイルで位置を直接指定します。
      // また、ジョイスティックとの干渉を防ぐためのカスタム属性を追加します。
      style={{ position: 'absolute', top: '1rem', right: '1rem', zIndex: 30 }}
      data-no-joystick="true"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="bg-black/40 hover:bg-black/60 border-white/20">
            <EllipsisVerticalIcon className="h-6 w-6 text-white" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-40" align="end">
          <DropdownMenuItem onClick={() => supabase.auth.signOut()}>
            ログアウト
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}