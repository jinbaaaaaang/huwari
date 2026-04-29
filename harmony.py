"""
조화 점수 계산 모듈
규칙 기반 + 매트릭스 기반 scoring으로 구현
"""
import colorsys
from typing import List, Dict, Optional, Tuple
import math


def hex_to_rgb(hex_color: str) -> Tuple[int, int, int]:
    """HEX 색상을 RGB로 변환"""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))


def rgb_to_hsv(r: int, g: int, b: int) -> Tuple[float, float, float]:
    """RGB를 HSV로 변환"""
    r_norm = r / 255.0
    g_norm = g / 255.0
    b_norm = b / 255.0
    h, s, v = colorsys.rgb_to_hsv(r_norm, g_norm, b_norm)
    return (h * 360, s, v)  # hue를 0-360도로 변환


def circular_hue_distance(h1: float, h2: float) -> float:
    """원형 hue 거리 계산 (0~180)"""
    diff = abs(h1 - h2)
    return min(diff, 360 - diff)


def calculate_color_score(
    before_colors: List[Dict],
    after_colors: List[Dict]
) -> Tuple[float, List[str], Dict]:
    """
    색상 점수 계산 (0~100)
    
    Returns:
        (score, reasons, debug_info)
    """
    reasons = []
    debug_info = {}
    
    # 색상 정보가 없으면 중립 점수 반환
    if not before_colors or not after_colors:
        reasons.append("색상 정보가 부족해 중립으로 계산")
        return 50.0, reasons, {"before_colors": len(before_colors) if before_colors else 0, "after_colors": len(after_colors) if after_colors else 0}
    
    # 대표색 추출 (percentage가 가장 큰 색)
    before_main = max(before_colors, key=lambda x: x.get('percentage', 0))
    after_main = max(after_colors, key=lambda x: x.get('percentage', 0))
    
    # 보조색 추출 (2등, 있으면)
    before_secondary = None
    after_secondary = None
    if len(before_colors) > 1:
        sorted_before = sorted(before_colors, key=lambda x: x.get('percentage', 0), reverse=True)
        before_secondary = sorted_before[1] if len(sorted_before) > 1 else None
    if len(after_colors) > 1:
        sorted_after = sorted(after_colors, key=lambda x: x.get('percentage', 0), reverse=True)
        after_secondary = sorted_after[1] if len(sorted_after) > 1 else None
    
    # HEX -> RGB -> HSV 변환
    before_rgb = before_main.get('rgb', [0, 0, 0])
    after_rgb = after_main.get('rgb', [0, 0, 0])
    
    before_hsv = rgb_to_hsv(before_rgb[0], before_rgb[1], before_rgb[2])
    after_hsv = rgb_to_hsv(after_rgb[0], after_rgb[1], after_rgb[2])
    
    debug_info['before_main'] = {
        'hex': before_main.get('hex', ''),
        'hsv': before_hsv
    }
    debug_info['after_main'] = {
        'hex': after_main.get('hex', ''),
        'hsv': after_hsv
    }
    
    # Hue 거리 계산
    hue_dist = circular_hue_distance(before_hsv[0], after_hsv[0])
    sat_diff = abs(before_hsv[1] - after_hsv[1])
    val_diff = abs(before_hsv[2] - after_hsv[2])
    avg_saturation = (before_hsv[1] + after_hsv[1]) / 2
    
    debug_info['hue_distance'] = hue_dist
    debug_info['sat_diff'] = sat_diff
    debug_info['val_diff'] = val_diff
    debug_info['avg_saturation'] = avg_saturation
    
    # Base 점수
    base_score = 70.0
    bonus = 0.0
    penalty = 0.0
    
    # Hue 거리 기반 보너스/패널티
    if hue_dist <= 25:
        bonus += 15
        reasons.append("유사한 색상으로 조화로운 조합")
    elif 25 < hue_dist <= 60:
        bonus += 8
        reasons.append("비슷한 색상 톤으로 자연스러운 조합")
    elif 60 < hue_dist < 140:
        # 중립
        pass
    elif hue_dist >= 140:
        # 보색 보너스 (단, saturation이 너무 높으면 패널티)
        if avg_saturation > 0.75:
            penalty += 8
            reasons.append("과도한 채도로 인한 시각적 충돌")
        else:
            bonus += 12
            reasons.append("보색 조합으로 생동감 있는 조합")
    
    # Saturation/Value 충돌 패널티
    if sat_diff > 0.5:
        penalty += 10
        reasons.append("채도 차이가 커 조화가 어려움")
    
    if val_diff > 0.5:
        penalty += 10
        reasons.append("명도 차이가 커 조화가 어려움")
    
    # 최종 점수 계산
    score = base_score + bonus - penalty
    score = max(0, min(100, score))  # clamp to 0~100
    
    debug_info['base_score'] = base_score
    debug_info['bonus'] = bonus
    debug_info['penalty'] = penalty
    debug_info['final_score'] = score
    
    return round(score, 1), reasons[:3], debug_info


# 재질 매트릭스 (9-bucket)
TEXTURE_MATRIX = {
    # 동일 버킷
    ("Woven (Plain)", "Woven (Plain)"): 90,
    ("Velvet/Corduroy", "Velvet/Corduroy"): 90,
    ("Knit/Jersey", "Knit/Jersey"): 90,
    ("Denim", "Denim"): 90,
    ("Silk", "Silk"): 90,
    ("Leather", "Leather"): 90,
    ("Wool/Cashmere", "Wool/Cashmere"): 90,
    ("Padded/Fleece/Fur", "Padded/Fleece/Fur"): 90,
    ("Synthetic/Other", "Synthetic/Other"): 90,
    
    # 특정 조합
    ("Woven (Plain)", "Knit/Jersey"): 82,
    ("Knit/Jersey", "Woven (Plain)"): 82,
    ("Woven (Plain)", "Denim"): 84,
    ("Denim", "Woven (Plain)"): 84,
    ("Denim", "Knit/Jersey"): 85,
    ("Knit/Jersey", "Denim"): 85,
    ("Silk", "Leather"): 70,
    ("Leather", "Silk"): 70,
    ("Velvet/Corduroy", "Padded/Fleece/Fur"): 65,
    ("Padded/Fleece/Fur", "Velvet/Corduroy"): 65,
}

TEXTURE_DEFAULT = 70  # Synthetic/Other와의 기본 점수
TEXTURE_NEUTRAL = 75  # 정의되지 않은 조합


def get_texture_score(texture1: Optional[str], texture2: Optional[str]) -> int:
    """재질 점수 조회"""
    if not texture1 or not texture2:
        return TEXTURE_NEUTRAL
    
    # 정확히 일치하는 경우
    if texture1 == texture2:
        return TEXTURE_MATRIX.get((texture1, texture2), 90)
    
    # 매트릭스에서 조회
    score = TEXTURE_MATRIX.get((texture1, texture2))
    if score is not None:
        return score
    
    # Synthetic/Other와의 조합
    if texture1 == "Synthetic/Other" or texture2 == "Synthetic/Other":
        return TEXTURE_DEFAULT
    
    # 정의되지 않은 조합
    return TEXTURE_NEUTRAL


def calculate_texture_score(
    before_items: List[Dict],
    after_items: List[Dict]
) -> Tuple[float, List[str], Dict]:
    """
    재질 점수 계산 (0~100)
    
    Returns:
        (score, reasons, debug_info)
    """
    reasons = []
    debug_info = {}
    
    if not before_items:
        reasons.append("Before 아이템이 없어 중립으로 계산")
        return 60.0, reasons, {}
    
    # afterItems가 없으면 beforeItems 내부 아이템들끼리 비교
    if not after_items:
        # beforeItems가 1개면 자기 자신과 비교할 수 없으므로 중립 반환
        if len(before_items) < 2:
            reasons.append("아이템이 1개뿐이어서 비교할 수 없음")
            return 60.0, reasons, {}
        
        # beforeItems 내부 아이템들끼리 pairwise 비교
        all_scores = []
        pair_details = []
        
        for i in range(len(before_items)):
            for j in range(i + 1, len(before_items)):
                item1_texture = before_items[i].get('texture')
                item2_texture = before_items[j].get('texture')
                
                if not item1_texture or not item2_texture:
                    continue
                
                score = get_texture_score(item1_texture, item2_texture)
                all_scores.append(score)
                pair_details.append({
                    'before': item1_texture,
                    'after': item2_texture,
                    'score': score
                })
        
        if not all_scores:
            reasons.append("재질 정보가 부족해 중립으로 계산")
            return 60.0, reasons, {}
        
        # 평균 계산
        avg_score = sum(all_scores) / len(all_scores)
        
        # 가장 낮은/높은 pair 찾기
        min_pair = min(pair_details, key=lambda x: x['score'])
        max_pair = max(pair_details, key=lambda x: x['score'])
        
        if min_pair['score'] < 75:
            reasons.append(f"재질: {min_pair['before']}와(과) {min_pair['after']} 조합이 조화롭지 않음")
        elif max_pair['score'] >= 85:
            reasons.append(f"재질: {max_pair['before']}와(과) {max_pair['after']} 조합이 잘 어울림")
        else:
            reasons.append(f"재질: {max_pair['before']}와(과) {max_pair['after']} 조합")
        
        debug_info['all_scores'] = all_scores
        debug_info['avg_score'] = avg_score
        debug_info['pairs'] = pair_details
        
        return round(avg_score, 1), reasons[:2], debug_info
    
    # afterItems 각각을 beforeItems 전체와 비교
    all_scores = []
    pair_details = []
    
    for after_item in after_items:
        after_texture = after_item.get('texture')
        if not after_texture:
            continue
        
        for before_item in before_items:
            before_texture = before_item.get('texture')
            if not before_texture:
                continue
            
            score = get_texture_score(before_texture, after_texture)
            all_scores.append(score)
            pair_details.append({
                'before': before_texture,
                'after': after_texture,
                'score': score
            })
    
    if not all_scores:
        reasons.append("재질 정보가 부족해 중립으로 계산")
        return 60.0, reasons, {}
    
    # 평균 계산
    avg_score = sum(all_scores) / len(all_scores)
    
    # 가장 낮은/높은 pair 찾기
    min_pair = min(pair_details, key=lambda x: x['score'])
    max_pair = max(pair_details, key=lambda x: x['score'])
    
    if min_pair['score'] < 75:
        reasons.append(f"재질: {min_pair['before']}와(과) {min_pair['after']} 조합이 조화롭지 않음")
    elif max_pair['score'] >= 85:
        reasons.append(f"재질: {max_pair['before']}와(과) {max_pair['after']} 조합이 잘 어울림")
    else:
        reasons.append(f"재질: {max_pair['before']}와(과) {max_pair['after']} 조합")
    
    debug_info['all_scores'] = all_scores
    debug_info['avg_score'] = avg_score
    debug_info['pairs'] = pair_details
    
    return round(avg_score, 1), reasons[:2], debug_info


# 패턴 매트릭스 (10-bucket)
PATTERN_MATRIX = {
    # Solid + anything: 90
    ("Solid", "Solid"): 90,
    ("Solid", "Stripe"): 90,
    ("Stripe", "Solid"): 90,
    ("Solid", "Check"): 90,
    ("Check", "Solid"): 90,
    ("Solid", "Dot"): 90,
    ("Dot", "Solid"): 90,
    ("Solid", "Floral"): 90,
    ("Floral", "Solid"): 90,
    ("Solid", "Paisley"): 90,
    ("Paisley", "Solid"): 90,
    ("Solid", "Graphic/Lettering"): 90,
    ("Graphic/Lettering", "Solid"): 90,
    ("Solid", "Leopard/Snake"): 90,
    ("Leopard/Snake", "Solid"): 90,
    ("Solid", "Camouflage"): 90,
    ("Camouflage", "Solid"): 90,
    ("Solid", "Other"): 90,
    ("Other", "Solid"): 90,
    
    # 특정 조합
    ("Stripe", "Check"): 65,
    ("Check", "Stripe"): 65,
    ("Floral", "Graphic/Lettering"): 65,
    ("Graphic/Lettering", "Floral"): 65,
    ("Leopard/Snake", "Graphic/Lettering"): 55,
    ("Graphic/Lettering", "Leopard/Snake"): 55,
    ("Check", "Check"): 82,
    ("Stripe", "Stripe"): 85,
}

PATTERN_DEFAULT = 72  # Other와의 기본 점수
PATTERN_NEUTRAL = 75  # 정의되지 않은 조합


def get_pattern_score(pattern1: Optional[str], pattern2: Optional[str]) -> int:
    """패턴 점수 조회"""
    if not pattern1 or not pattern2:
        return PATTERN_NEUTRAL
    
    # 매트릭스에서 조회
    score = PATTERN_MATRIX.get((pattern1, pattern2))
    if score is not None:
        return score
    
    # Other와의 조합
    if pattern1 == "Other" or pattern2 == "Other":
        return PATTERN_DEFAULT
    
    # 정의되지 않은 조합
    return PATTERN_NEUTRAL


def calculate_pattern_score(
    before_items: List[Dict],
    after_items: List[Dict]
) -> Tuple[float, List[str], Dict]:
    """
    패턴 점수 계산 (0~100)
    
    Returns:
        (score, reasons, debug_info)
    """
    reasons = []
    debug_info = {}
    
    if not before_items:
        reasons.append("Before 아이템이 없어 중립으로 계산")
        return 70.0, reasons, {}
    
    # afterItems가 없으면 beforeItems 내부 아이템들끼리 비교
    if not after_items:
        # beforeItems가 1개면 자기 자신과 비교할 수 없으므로 중립 반환
        if len(before_items) < 2:
            reasons.append("아이템이 1개뿐이어서 비교할 수 없음")
            return 70.0, reasons, {}
        
        # beforeItems 내부 아이템들끼리 pairwise 비교
        all_scores = []
        pair_details = []
        
        for i in range(len(before_items)):
            for j in range(i + 1, len(before_items)):
                item1_pattern = before_items[i].get('pattern')
                item2_pattern = before_items[j].get('pattern')
                
                if not item1_pattern or not item2_pattern:
                    continue
                
                score = get_pattern_score(item1_pattern, item2_pattern)
                all_scores.append(score)
                pair_details.append({
                    'before': item1_pattern,
                    'after': item2_pattern,
                    'score': score
                })
        
        if not all_scores:
            reasons.append("패턴 정보가 부족해 중립으로 계산")
            return 70.0, reasons, {}
        
        # 평균 계산
        avg_score = sum(all_scores) / len(all_scores)
        
        # 가장 낮은/높은 pair 찾기
        min_pair = min(pair_details, key=lambda x: x['score'])
        max_pair = max(pair_details, key=lambda x: x['score'])
        
        if min_pair['score'] < 70:
            reasons.append(f"패턴: {min_pair['before']}와(과) {min_pair['after']} 조합이 조화롭지 않음")
        elif max_pair['score'] >= 85:
            reasons.append(f"패턴: {max_pair['before']}와(과) {max_pair['after']} 조합이 잘 어울림")
        else:
            reasons.append(f"패턴: {max_pair['before']}와(과) {max_pair['after']} 조합")
        
        debug_info['all_scores'] = all_scores
        debug_info['avg_score'] = avg_score
        debug_info['pairs'] = pair_details
        
        return round(avg_score, 1), reasons[:2], debug_info
    
    # afterItems 각각을 beforeItems 전체와 비교
    all_scores = []
    pair_details = []
    
    for after_item in after_items:
        after_pattern = after_item.get('pattern')
        if not after_pattern:
            continue
        
        for before_item in before_items:
            before_pattern = before_item.get('pattern')
            if not before_pattern:
                continue
            
            score = get_pattern_score(before_pattern, after_pattern)
            all_scores.append(score)
            pair_details.append({
                'before': before_pattern,
                'after': after_pattern,
                'score': score
            })
    
    if not all_scores:
        reasons.append("패턴 정보가 부족해 중립으로 계산")
        return 70.0, reasons, {}
    
    # 평균 계산
    avg_score = sum(all_scores) / len(all_scores)
    
    # 가장 낮은/높은 pair 찾기
    min_pair = min(pair_details, key=lambda x: x['score'])
    max_pair = max(pair_details, key=lambda x: x['score'])
    
    if min_pair['score'] < 70:
        reasons.append(f"패턴: {min_pair['before']}와(과) {min_pair['after']} 조합이 조화롭지 않음")
    elif max_pair['score'] >= 85:
        reasons.append(f"패턴: {max_pair['before']}와(과) {max_pair['after']} 조합이 잘 어울림")
    else:
        reasons.append(f"패턴: {max_pair['before']}와(과) {max_pair['after']} 조합")
    
    debug_info['all_scores'] = all_scores
    debug_info['avg_score'] = avg_score
    debug_info['pairs'] = pair_details
    
    return round(avg_score, 1), reasons[:2], debug_info


# 스타일 매트릭스 (8-class)
STYLE_MATRIX = {
    # 동일 스타일
    ("캐주얼", "캐주얼"): 95,
    ("고프코어", "고프코어"): 95,
    ("미니멀", "미니멀"): 95,
    ("긱시크", "긱시크"): 95,
    ("로맨틱", "로맨틱"): 95,
    ("빈티지", "빈티지"): 95,
    ("포멀", "포멀"): 95,
    ("Y2K", "Y2K"): 95,
    
    # 특정 조합
    ("캐주얼", "미니멀"): 85,
    ("미니멀", "캐주얼"): 85,
    ("포멀", "고프코어"): 60,
    ("고프코어", "포멀"): 60,
    ("로맨틱", "빈티지"): 80,
    ("빈티지", "로맨틱"): 80,
    ("Y2K", "캐주얼"): 82,
    ("캐주얼", "Y2K"): 82,
}

STYLE_NEUTRAL = 75  # 정의되지 않은 조합


def get_style_score(style1: Optional[str], style2: Optional[str]) -> int:
    """스타일 점수 조회"""
    if not style1 or not style2:
        return STYLE_NEUTRAL
    
    # 매트릭스에서 조회
    score = STYLE_MATRIX.get((style1, style2))
    if score is not None:
        return score
    
    # 정의되지 않은 조합
    return STYLE_NEUTRAL


def calculate_style_score(
    before_items: List[Dict],
    after_items: List[Dict]
) -> Tuple[float, List[str], Dict]:
    """
    스타일 점수 계산 (0~100)
    
    Returns:
        (score, reasons, debug_info)
    """
    reasons = []
    debug_info = {}
    
    if not before_items:
        reasons.append("Before 아이템이 없어 중립으로 계산")
        return 70.0, reasons, {}
    
    # afterItems가 없으면 beforeItems 내부 아이템들끼리 비교
    if not after_items:
        # beforeItems가 1개면 자기 자신과 비교할 수 없으므로 중립 반환
        if len(before_items) < 2:
            reasons.append("아이템이 1개뿐이어서 비교할 수 없음")
            return 70.0, reasons, {}
        
        # beforeItems 내부 아이템들끼리 pairwise 비교
        all_scores = []
        pair_details = []
        
        for i in range(len(before_items)):
            for j in range(i + 1, len(before_items)):
                item1_style = before_items[i].get('style')
                item2_style = before_items[j].get('style')
                
                if not item1_style or not item2_style:
                    continue
                
                score = get_style_score(item1_style, item2_style)
                all_scores.append(score)
                pair_details.append({
                    'before': item1_style,
                    'after': item2_style,
                    'score': score
                })
        
        if not all_scores:
            reasons.append("스타일 정보가 부족해 중립으로 계산")
            return 70.0, reasons, {}
        
        # 평균 계산
        avg_score = sum(all_scores) / len(all_scores)
        
        # 가장 낮은/높은 pair 찾기
        min_pair = min(pair_details, key=lambda x: x['score'])
        max_pair = max(pair_details, key=lambda x: x['score'])
        
        if min_pair['score'] < 70:
            reasons.append(f"스타일: {min_pair['before']}와(과) {min_pair['after']} 조합이 조화롭지 않음")
        elif max_pair['score'] >= 90:
            reasons.append(f"스타일: {max_pair['before']}와(과) {max_pair['after']} 조합이 잘 어울림")
        else:
            reasons.append(f"스타일: {max_pair['before']}와(과) {max_pair['after']} 조합")
        
        debug_info['all_scores'] = all_scores
        debug_info['avg_score'] = avg_score
        debug_info['pairs'] = pair_details
        
        return round(avg_score, 1), reasons[:2], debug_info
    
    # afterItems 각각을 beforeItems 전체와 비교
    all_scores = []
    pair_details = []
    
    for after_item in after_items:
        after_style = after_item.get('style')
        if not after_style:
            continue
        
        for before_item in before_items:
            before_style = before_item.get('style')
            if not before_style:
                continue
            
            score = get_style_score(before_style, after_style)
            all_scores.append(score)
            pair_details.append({
                'before': before_style,
                'after': after_style,
                'score': score
            })
    
    if not all_scores:
        reasons.append("스타일 정보가 부족해 중립으로 계산")
        return 70.0, reasons, {}
    
    # 평균 계산
    avg_score = sum(all_scores) / len(all_scores)
    
    # 가장 낮은/높은 pair 찾기
    min_pair = min(pair_details, key=lambda x: x['score'])
    max_pair = max(pair_details, key=lambda x: x['score'])
    
    if min_pair['score'] < 70:
        reasons.append(f"스타일: {min_pair['before']}와(과) {min_pair['after']} 조합이 조화롭지 않음")
    elif max_pair['score'] >= 90:
        reasons.append(f"스타일: {max_pair['before']}와(과) {max_pair['after']} 조합이 잘 어울림")
    else:
        reasons.append(f"스타일: {max_pair['before']}와(과) {max_pair['after']} 조합")
    
    debug_info['all_scores'] = all_scores
    debug_info['avg_score'] = avg_score
    debug_info['pairs'] = pair_details
    
    return round(avg_score, 1), reasons[:2], debug_info


def calculate_harmony_score(
    before_items: List[Dict],
    after_items: List[Dict]
) -> Dict:
    """
    전체 조화 점수 계산
    
    Args:
        before_items: Before 아이템 리스트
        after_items: After 아이템 리스트
    
    Returns:
        {
            'score_total': float (0~100),
            'score_color': float,
            'score_texture': float,
            'score_pattern': float,
            'score_style': float,
            'reasons': List[str] (2~4개),
            'debug': Dict
        }
    """
    # Before 아이템이 없으면 중립 반환
    if not before_items:
        return {
            'score_total': 50.0,
            'score_color': 50.0,
            'score_texture': 60.0,
            'score_pattern': 70.0,
            'score_style': 70.0,
            'reasons': ['Before 아이템이 없어 중립으로 계산'],
            'debug': {}
        }
    
    # Before/After 색상 수집
    before_colors = []
    after_colors = []
    
    for item in before_items:
        if item.get('colors'):
            before_colors.extend(item['colors'])
    
    # afterItems가 없으면 beforeItems 내부 아이템들끼리 색상 비교
    if not after_items:
        # beforeItems가 1개면 자기 자신과 비교할 수 없으므로 중립 반환
        if len(before_items) < 2:
            after_colors = []
        else:
            # beforeItems 내부 아이템들의 색상을 모두 수집
            # 각 아이템의 대표색(percentage 최대)을 추출해서 비교
            item_main_colors = []
            for item in before_items:
                if item.get('colors') and len(item['colors']) > 0:
                    # 각 아이템의 대표색 추출
                    main_color = max(item['colors'], key=lambda x: x.get('percentage', 0))
                    item_main_colors.append(main_color)
            
            # 아이템이 2개 이상이고 색상이 있으면 비교
            if len(item_main_colors) >= 2:
                # 첫 번째 아이템의 대표색과 나머지 아이템들의 대표색 비교
                # 간단하게 첫 번째와 두 번째 아이템의 대표색 비교
                before_colors = [item_main_colors[0]]
                after_colors = [item_main_colors[1]]
            else:
                after_colors = []
    else:
        for item in after_items:
            if item.get('colors'):
                after_colors.extend(item['colors'])
    
    # 각 점수 계산
    score_color, reasons_color, debug_color = calculate_color_score(before_colors, after_colors)
    score_texture, reasons_texture, debug_texture = calculate_texture_score(before_items, after_items)
    score_pattern, reasons_pattern, debug_pattern = calculate_pattern_score(before_items, after_items)
    score_style, reasons_style, debug_style = calculate_style_score(before_items, after_items)
    
    # 가중합으로 총점 계산
    # color 0.45, style 0.25, texture 0.15, pattern 0.15
    score_total = round(
        0.45 * score_color +
        0.25 * score_style +
        0.15 * score_texture +
        0.15 * score_pattern,
        1
    )
    score_total = max(0, min(100, score_total))  # clamp
    
    # Reasons 수집 (점수에 가장 큰 영향을 준 것 우선)
    all_reasons = []
    
    # 가장 낮은 점수 항목부터 reasons에 추가
    scores_with_reasons = [
        (score_color, reasons_color, '색상'),
        (score_texture, reasons_texture, '재질'),
        (score_pattern, reasons_pattern, '패턴'),
        (score_style, reasons_style, '스타일')
    ]
    scores_with_reasons.sort(key=lambda x: x[0])  # 낮은 점수부터
    
    # 2~4개 reasons 생성
    for score, reasons, name in scores_with_reasons[:2]:
        if reasons:
            all_reasons.extend(reasons[:1])  # 각 항목당 최대 1개
    
    # 부족하면 높은 점수 항목에서도 추가
    if len(all_reasons) < 2:
        for score, reasons, name in scores_with_reasons[-2:]:
            if reasons and len(all_reasons) < 4:
                for reason in reasons:
                    if reason not in all_reasons and len(all_reasons) < 4:
                        all_reasons.append(reason)
    
    # 최소 2개, 최대 4개
    all_reasons = all_reasons[:4]
    if len(all_reasons) < 2:
        all_reasons.append("전반적으로 조화로운 조합")
    
    return {
        'score_total': score_total,
        'score_color': score_color,
        'score_texture': score_texture,
        'score_pattern': score_pattern,
        'score_style': score_style,
        'reasons': all_reasons,
        'debug': {
            'color': debug_color,
            'texture': debug_texture,
            'pattern': debug_pattern,
            'style': debug_style
        }
    }
