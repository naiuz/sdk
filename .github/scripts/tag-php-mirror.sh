#!/usr/bin/env bash
# Pushes php/, as it is at a release tag of naiuz/sdk, to the read-only mirror as the tag Packagist reads: php-v0.1.0
# becomes v0.1.0. The split is git subtree's, the same commits split-php.yml pushes to the mirror's main, so the tag
# lands on that history. Nothing is forced and no other ref is pushed: a tag the mirror has already is left as it is,
# which is done when it names the same commit, and refused when it names another.
#
# Usage, from the repository's root with its history and tags fetched:
#   tag-php-mirror.sh <mirror> <release tag> <mirror tag>
set -euo pipefail

mirror="$1"
tag="$2"
mirror_tag="$3"

commit="$(git rev-parse --verify "refs/tags/$tag^{commit}")"
split="$(git subtree split --prefix=php "$commit")"

# The mirror's main is behind the split, when it isn't mirrored yet, or ahead of it, when it is and more has been since:
# either way the tag is on its line. Beside it, something other than split-php.yml has pushed there.
git fetch --quiet --no-tags "$mirror" refs/heads/main
main="$(git rev-parse FETCH_HEAD)"
if ! git merge-base --is-ancestor "$main" "$split" && ! git merge-base --is-ancestor "$split" "$main"; then
  echo "::error title=Mirror diverged::The mirror's main ($main) isn't on the line of php/ at $tag ($split), so $mirror_tag isn't pushed."
  exit 1
fi

existing="$(git ls-remote "$mirror" "refs/tags/$mirror_tag" | cut -f1)"
if [ "$existing" = "$split" ]; then
  echo "The mirror's $mirror_tag already names php/ at $tag ($split)."
  exit 0
fi
if [ -n "$existing" ]; then
  echo "::error title=Tag taken::The mirror's $mirror_tag names $existing, not php/ at $tag ($split), and is left as it is."
  exit 1
fi
git push --quiet "$mirror" "$split:refs/tags/$mirror_tag"
echo "Pushed $mirror_tag, php/ at $tag ($split), to the mirror."
