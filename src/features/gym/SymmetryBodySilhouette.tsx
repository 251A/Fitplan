import React from 'react';

export interface SymmetryBodySilhouetteProps {
  view?: 'front' | 'back' | 'dual' | 'auto';
  highlightedMuscles?: string[]; // e.g. ['chest', 'lats', 'shoulders', 'biceps', 'quads', 'glutes']
  highlightColor?: string; // default cyan #38bdf8
  rankMode?: boolean; // if true, uses multi-color rank scheme (Screenshot 2)
  width?: number | string;
  height?: number | string;
  className?: string;
}

export const SymmetryBodySilhouette: React.FC<SymmetryBodySilhouetteProps> = ({
  view = 'auto',
  highlightedMuscles = [],
  highlightColor = '#38bdf8',
  rankMode = false,
  width = '100%',
  height = '100%',
  className = '',
}) => {
  const normMuscles = highlightedMuscles.map((m) => m.toLowerCase());

  // Determine view if 'auto'
  let activeView = view;
  if (view === 'auto') {
    const backMuscles = ['back', 'lats', 'dorsales', 'espalda', 'glutes', 'glúteos', 'hamstrings', 'femorales', 'traps', 'trapecio'];
    const hasBackFocus = normMuscles.some((m) => backMuscles.some((b) => m.includes(b)));
    activeView = hasBackFocus ? 'back' : 'front';
  }

  const isHighlighted = (group: string) => {
    return normMuscles.some((m) => m.includes(group.toLowerCase()));
  };

  const getFill = (group: string, rankColor: string) => {
    if (rankMode) return rankColor;
    return isHighlighted(group) ? highlightColor : '#16181d';
  };

  // FRONT VIEW SILHOUETTE
  const renderFront = () => {
    const chestFill = getFill('chest', '#ef4444');
    const shouldersFill = getFill('shoulder', '#ef4444');
    const bicepsFill = getFill('biceps', '#f59e0b');
    const quadsFill = getFill('quad', '#f59e0b');
    const absFill = getFill('abs', '#22252c');

    return (
      <svg
        viewBox="0 0 160 270"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: '100%', height: '100%', maxHeight: '100%' }}
      >
        <g stroke="#ffffff" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round">
          {/* Head & Neck */}
          <path d="M72 16 C72 7 88 7 88 16 C88 26 84 32 80 34 C76 32 72 26 72 16 Z" fill="#16181d" />
          <path d="M74 34 L72 44 L88 44 L86 34" fill="#16181d" />

          {/* Shoulders / Delts */}
          <path d="M60 45 C52 48 46 56 46 66 C46 72 50 78 54 82 L64 68 Z" fill={shouldersFill} />
          <path d="M100 45 C108 48 114 56 114 66 C114 72 110 78 106 82 L96 68 Z" fill={shouldersFill} />

          {/* Chest (Left & Right Pectorals) */}
          <path d="M80 46 L65 47 C57 56 61 74 79 76 L80 46 Z" fill={chestFill} />
          <path d="M80 46 L95 47 C103 56 99 74 81 76 L80 46 Z" fill={chestFill} />

          {/* Biceps / Arms */}
          <path d="M52 82 C46 88 44 98 44 110 L54 112 C58 98 58 90 54 82 Z" fill={bicepsFill} />
          <path d="M108 82 C114 88 116 98 116 110 L106 112 C102 98 102 90 106 82 Z" fill={bicepsFill} />

          {/* Forearms */}
          <path d="M44 112 L34 142 L42 144 L54 114 Z" fill="#16181d" />
          <path d="M116 112 L126 142 L118 144 L106 114 Z" fill="#16181d" />
          {/* Hands */}
          <path d="M34 144 L30 156 L38 156 Z" fill="#16181d" />
          <path d="M126 144 L130 156 L122 156 Z" fill="#16181d" />

          {/* Abs / Torso Core */}
          <path d="M70 78 L66 118 L80 128 L94 118 L90 78 C84 80 76 80 70 78 Z" fill={absFill} />
          {/* Abs six-pack divider lines */}
          <line x1="80" y1="78" x2="80" y2="128" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8" />
          <line x1="72" y1="92" x2="88" y2="92" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8" />
          <line x1="70" y1="106" x2="90" y2="106" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8" />

          {/* Hips / Pelvis */}
          <path d="M66 118 L62 136 L80 144 L98 136 L94 118 Z" fill="#16181d" />

          {/* Quads / Upper Thighs */}
          <path d="M62 138 C56 150 56 180 64 196 L76 194 C78 178 78 152 78 144 Z" fill={quadsFill} />
          <path d="M98 138 C104 150 104 180 96 196 L84 194 C82 178 82 152 82 144 Z" fill={quadsFill} />

          {/* Calves / Lower Legs */}
          <path d="M64 198 C60 210 60 236 68 252 L74 252 C76 236 74 212 74 198 Z" fill="#16181d" />
          <path d="M96 198 C100 210 100 236 92 252 L86 252 C84 236 86 212 86 198 Z" fill="#16181d" />
          {/* Feet */}
          <path d="M68 254 L64 264 L74 264 Z" fill="#16181d" />
          <path d="M92 254 L96 264 L86 264 Z" fill="#16181d" />
        </g>
      </svg>
    );
  };

  // BACK VIEW SILHOUETTE
  const renderBack = () => {
    const latsFill = getFill('lat', '#f59e0b');
    const trapsFill = getFill('trap', '#ef4444');
    const rearDeltsFill = getFill('shoulder', '#10b981');
    const tricepsFill = getFill('tricep', '#f59e0b');
    const glutesFill = getFill('glute', '#f59e0b');
    const hamstringsFill = getFill('hamstring', '#f59e0b');

    return (
      <svg
        viewBox="0 0 160 270"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: '100%', height: '100%', maxHeight: '100%' }}
      >
        <g stroke="#ffffff" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round">
          {/* Head & Neck (Back) */}
          <path d="M72 16 C72 7 88 7 88 16 C88 26 84 32 80 34 C76 32 72 26 72 16 Z" fill="#16181d" />
          <path d="M74 34 L72 44 L88 44 L86 34" fill="#16181d" />

          {/* Trapezius */}
          <path d="M80 44 L66 48 L72 68 L80 74 L88 68 L94 48 Z" fill={trapsFill} />

          {/* Rear Delts */}
          <path d="M64 48 C56 52 52 58 50 68 L62 72 Z" fill={rearDeltsFill} />
          <path d="M96 48 C104 52 108 58 110 68 L98 72 Z" fill={rearDeltsFill} />

          {/* Triceps (Back Arms) */}
          <path d="M48 70 C44 80 42 96 42 110 L52 112 C54 96 58 82 60 72 Z" fill={tricepsFill} />
          <path d="M112 70 C116 80 118 96 118 110 L108 112 C106 96 102 82 100 72 Z" fill={tricepsFill} />

          {/* Forearms & Hands */}
          <path d="M42 112 L34 142 L42 144 L52 114 Z" fill="#16181d" />
          <path d="M118 112 L126 142 L118 144 L108 114 Z" fill="#16181d" />
          <path d="M34 144 L30 156 L38 156 Z" fill="#16181d" />
          <path d="M126 144 L130 156 L122 156 Z" fill="#16181d" />

          {/* Lats (Dorsales) */}
          <path d="M62 72 L62 106 C68 114 74 116 80 116 L80 74 Z" fill={latsFill} />
          <path d="M98 72 L98 106 C92 114 86 116 80 116 L80 74 Z" fill={latsFill} />

          {/* Lower Back */}
          <path d="M64 108 L62 126 L80 130 L98 126 L96 108 C90 114 70 114 64 108 Z" fill="#16181d" />

          {/* Glutes */}
          <path d="M62 126 C56 136 56 154 68 158 C76 160 80 148 80 130 Z" fill={glutesFill} />
          <path d="M98 126 C104 136 104 154 92 158 C84 160 80 148 80 130 Z" fill={glutesFill} />

          {/* Hamstrings */}
          <path d="M66 160 C58 174 58 186 64 196 L76 196 C78 186 78 172 76 160 Z" fill={hamstringsFill} />
          <path d="M94 160 C102 174 102 186 96 196 L84 196 C82 186 82 172 84 160 Z" fill={hamstringsFill} />

          {/* Calves (Back Lower Legs) */}
          <path d="M64 198 C58 212 58 238 68 252 L74 252 C76 238 74 212 74 198 Z" fill="#16181d" />
          <path d="M96 198 C102 212 102 238 92 252 L86 252 C84 238 86 212 86 198 Z" fill="#16181d" />
          {/* Feet */}
          <path d="M68 254 L66 264 L74 264 Z" fill="#16181d" />
          <path d="M92 254 L94 264 L86 264 Z" fill="#16181d" />
        </g>
      </svg>
    );
  };

  if (activeView === 'dual') {
    return (
      <div
        className={`sym-mannequin-dual ${className}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          width,
          height,
        }}
      >
        <div style={{ flex: 1, height: '100%', display: 'flex', justifyContent: 'center' }}>
          {renderFront()}
        </div>
        <div style={{ flex: 1, height: '100%', display: 'flex', justifyContent: 'center' }}>
          {renderBack()}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`sym-mannequin-single ${className}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width,
        height,
      }}
    >
      {activeView === 'back' ? renderBack() : renderFront()}
    </div>
  );
};
