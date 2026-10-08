import { shouldAutoSkip } from '@kit/ui';
import type { App, Route, Screen } from './app';
import { itemById, endgameById } from './content';
import { AcademyScreen } from './screens/academy';
import { CardScreen } from './screens/cards';
import { DeployScreen, lessonDeployNext } from './screens/deploy';
import { DeployItemScreen } from './screens/deploy-item';
import { EndgamesScreen } from './screens/endgames';
import { FamilyScreen } from './screens/family';
import { FtScreen, completeFt } from './screens/ft';
import { HomeScreen } from './screens/home';
import { LadderScreen } from './screens/ladder';
import { MatchScreen } from './screens/match';
import { MedalsScreen } from './screens/medals';
import { ParentScreen } from './screens/parent';
import { PhysicalScreen } from './screens/physical';
import { PuzzleScreen } from './screens/puzzle';
import { ResultScreen } from './screens/result';
import { ReviewScreen } from './screens/review';
import { RulesScreen } from './screens/rules';
import { StyleScreen } from './screens/style';

export function makeScreen(app: App, r: Route): Screen {
  switch (r.name) {
    case 'home':
      // the first-time flow runs once, before the camp (spec §2.6)
      if (!app.save.firstRun.ft && !app.test && !r.skipFt) {
        // the parent's 跳过开场和教学: as if 跳过 had been tapped (FT done, first shoulder board)
        if (shouldAutoSkip()) return new HomeScreen(app, { ftPromos: completeFt(app, { skipped: true, auto: true }) });
        return new FtScreen(app);
      }
      return new HomeScreen(app, { ftPromos: r.ftPromos });
    case 'ft':
      return new FtScreen(app);
    case 'family':
      return new FamilyScreen(app);
    case 'deploy':
      return new DeployScreen(app, r.next);
    case 'match':
      if (!r.setup && !(r.resume && app.save.resume)) return new HomeScreen(app, {});
      return new MatchScreen(app, r);
    case 'result':
      return new ResultScreen(app, r.data);
    case 'review':
      return new ReviewScreen(app, r.data, r.ply ?? 0);
    case 'physical':
      return new PhysicalScreen(app);
    case 'academy':
      return new AcademyScreen(app, r.lesson);
    case 'item': {
      if (endgameById(r.id)) return new PuzzleScreen(app, r.id, { twin: r.twin, resume: r.resume });
      const it = itemById(r.id);
      if (!it) return new AcademyScreen(app);
      if (it.type === 'board' || it.type === 'scene') return new PuzzleScreen(app, r.id, { twin: r.twin, resume: r.resume });
      if (it.type === 'deploy') return new DeployItemScreen(app, it);
      if (it.type === 'deploy-full') return new DeployScreen(app, lessonDeployNext(it));
      return new CardScreen(app, it, { twin: r.twin });
    }
    case 'ladder':
      return new LadderScreen(app, { mode: r.mode, free: r.free });
    case 'endgames':
      return new EndgamesScreen(app);
    case 'medals':
      return new MedalsScreen(app);
    case 'rules':
      return new RulesScreen(app, r.from ?? 'home', r.card ?? 0);
    case 'parent':
      return new ParentScreen(app);
    case 'style':
      return new StyleScreen(app);
  }
}
